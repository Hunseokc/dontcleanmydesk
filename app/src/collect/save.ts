// 수집은 3초 안에 끝나야 한다. 분류(자동)와 얼굴(절차적 썸네일)은 즉시, 더 나은 썸네일은 저장 뒤 백그라운드로.
import { classifyFile, classifyText } from '@/core/classify';
import { colorFor, newId } from '@/core/random';
import type { Item, ItemType } from '@/core/types';
import { files } from '@/store/db';
import { toRef } from '@/store/refs';
import { store, type ItemDraft } from '@/store/store';
import { proceduralThumbnail, upgradeThumbnail } from '@/thumbs/pipeline';

export interface Attachment {
  /** blob:, data:, file: URI */
  uri: string;
  mime: string;
  name: string;
  /** 웹에서는 원본 File/Blob 을 그대로 넣는다 */
  blob?: Blob;
}

export function attachmentType(a: Attachment): ItemType | null {
  return classifyFile(a.mime, a.name);
}

async function finish(draft: ItemDraft & { id: string }): Promise<Item> {
  const color = colorFor(draft.id);
  const probe = { ...draft, color, tags: [], binId: '', createdAt: 0, updatedAt: 0, lastSeenAt: null, seenCount: 0 } as Item;
  let thumbnail: string | null = null;
  try {
    thumbnail = await proceduralThumbnail(probe);
  } catch (e) {
    console.warn('[collect] 절차적 썸네일 실패', e);
  }
  const item = store.addItem({ ...draft, color, thumbnail, thumbnailSource: thumbnail ? 'procedural' : null });
  void upgradeThumbnail(item.id);
  return item;
}

/** 글·링크·첨부를 아이템으로. 첨부가 있으면 글은 첫 첨부의 제목이 된다. */
export async function saveIdea(text: string, attachments: Attachment[]): Promise<Item[]> {
  const out: Item[] = [];
  const body = text.trim();

  for (const [i, a] of attachments.entries()) {
    const type = attachmentType(a);
    if (!type) continue;
    const id = newId();
    const key = `file_${id}`;
    await files.put(key, a.blob ?? a.uri, a.mime);
    out.push(
      await finish({
        id, type, content: toRef(key), mime: a.mime, fileName: a.name,
        title: i === 0 && body ? body.slice(0, 120) : a.name.replace(/\.[^.]+$/, ''),
      }),
    );
  }

  if (body && !attachments.length) {
    const { type, sourceUrl } = classifyText(body);
    const id = newId();
    // 링크 제목은 비워 두고 서버 메타데이터로 채운다(없으면 화면에서 도메인을 보여 준다)
    out.push(await finish({ id, type, content: body, sourceUrl }));
  }
  return out;
}
