package desk.room

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.jsoup.Jsoup
import java.net.URI
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap

@Serializable
data class LinkMeta(
    val url: String,
    val title: String? = null,
    val description: String? = null,
    val siteName: String? = null,
    val image: String? = null,
    /** "og" | "oembed" */
    val imageSource: String? = null,
)

/**
 * 링크 미리보기. 브라우저는 CORS 때문에 다른 사이트의 OG 이미지·메타데이터를 직접 못 읽으므로 서버가 대신 가져온다.
 * 1순위 og:image, 2순위 oEmbed·정해진 썸네일 URL. 실패하면 클라이언트가 절차적 썸네일로 넘어간다.
 */
class LinkMetaService(private val http: SafeHttp) {
    private val cache = ConcurrentHashMap<String, Pair<Long, LinkMeta>>()
    private val json = Json { ignoreUnknownKeys = true }

    fun fetch(url: String): LinkMeta {
        val now = System.currentTimeMillis()
        cache[url]?.let { (at, meta) -> if (now - at < CACHE_MS) return meta }
        val meta = knownProvider(url) ?: fromHtml(url)
        if (cache.size > CACHE_MAX) cache.entries.sortedBy { it.value.first }.take(CACHE_MAX / 4).forEach { cache.remove(it.key) }
        cache[url] = now to meta
        return meta
    }

    /** 유튜브·스포티파이 등은 oEmbed 나 정해진 썸네일 URL 이 더 정확하다 */
    private fun knownProvider(url: String): LinkMeta? {
        val host = runCatching { URI(url).host?.removePrefix("www.")?.removePrefix("m.") }.getOrNull() ?: return null
        youtubeId(url)?.let { id ->
            val o = oembed("https://www.youtube.com/oembed?format=json&url=" + enc(url))
            return LinkMeta(url, o?.str("title"), null, "YouTube", "https://i.ytimg.com/vi/$id/hqdefault.jpg", "oembed")
        }
        val endpoint = when {
            host.endsWith("spotify.com") -> "https://open.spotify.com/oembed?url="
            host.endsWith("vimeo.com") -> "https://vimeo.com/api/oembed.json?url="
            host.endsWith("soundcloud.com") -> "https://soundcloud.com/oembed?format=json&url="
            else -> return null
        }
        val o = oembed(endpoint + enc(url)) ?: return null
        return LinkMeta(url, o.str("title"), null, o.str("provider_name"), o.str("thumbnail_url"), o.str("thumbnail_url")?.let { "oembed" })
    }

    private fun fromHtml(url: String): LinkMeta {
        val res = http.get(url, MAX_HTML, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5")
        val type = res.contentType?.lowercase() ?: ""
        if (type.startsWith("image/")) return LinkMeta(url, null, null, null, res.url.toString(), "og")
        val html = String(res.body, charsetOf(type))
        val meta = parseHtml(url, res.url.toString(), html)
        if (meta.image != null) return meta
        // og:image 가 없으면 oEmbed 자동 발견
        val discovered = Jsoup.parse(html, res.url.toString()).selectFirst("link[type=application/json+oembed]")?.absUrl("href")
        val thumb = discovered?.takeIf { it.isNotBlank() }?.let { oembed(it)?.str("thumbnail_url") }
        return if (thumb != null) meta.copy(image = thumb, imageSource = "oembed") else meta
    }

    private fun oembed(endpoint: String): JsonObject? = runCatching {
        val res = http.get(endpoint, 256 * 1024, "application/json")
        if (res.status !in 200..299) null else json.parseToJsonElement(String(res.body)).jsonObject
    }.getOrNull()

    companion object {
        private const val CACHE_MS = 60 * 60 * 1000L
        private const val CACHE_MAX = 1000
        private const val MAX_HTML = 1_500_000

        private fun enc(s: String) = URLEncoder.encode(s, Charsets.UTF_8)
        private fun JsonObject.str(k: String) = this[k]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }

        private fun charsetOf(contentType: String) =
            Regex("charset=([\\w-]+)").find(contentType)?.groupValues?.get(1)
                ?.let { runCatching { charset(it) }.getOrNull() } ?: Charsets.UTF_8

        fun parseHtml(requested: String, finalUrl: String, html: String): LinkMeta {
            val doc = Jsoup.parse(html, finalUrl)
            fun meta(vararg keys: String): String? = keys.firstNotNullOfOrNull { k ->
                doc.selectFirst("meta[property=$k], meta[name=$k]")?.attr("content")?.trim()?.takeIf { it.isNotEmpty() }
            }
            val imageRaw = meta("og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src")
                ?: doc.selectFirst("link[rel=image_src]")?.attr("href")
            val image = imageRaw?.let { runCatching { URI(finalUrl).resolve(it.replace(" ", "%20")).toString() }.getOrNull() }
            return LinkMeta(
                url = requested,
                title = meta("og:title", "twitter:title") ?: doc.title().takeIf { it.isNotBlank() },
                description = meta("og:description", "twitter:description", "description"),
                siteName = meta("og:site_name") ?: runCatching { URI(finalUrl).host?.removePrefix("www.") }.getOrNull(),
                image = image,
                imageSource = image?.let { "og" },
            )
        }

        fun youtubeId(url: String): String? = runCatching {
            val u = URI(url)
            val host = u.host?.removePrefix("www.")?.removePrefix("m.") ?: return null
            when {
                host == "youtu.be" -> u.path.trim('/').split('/').firstOrNull()?.takeIf { it.isNotBlank() }
                host.endsWith("youtube.com") && host != "music.youtube.com" ->
                    u.rawQuery?.split('&')?.firstOrNull { it.startsWith("v=") }?.substring(2)
                        ?: Regex("^/(shorts|embed|live)/([^/?#]+)").find(u.path)?.groupValues?.get(2)
                else -> null
            }
        }.getOrNull()
    }
}
