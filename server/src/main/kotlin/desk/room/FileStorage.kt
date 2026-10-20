package desk.room

import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.io.InputStream

/** 미디어 원본과 썸네일 저장소. 지금은 로컬 디스크, 운영에서는 같은 인터페이스로 S3 호환 스토리지를 붙인다. */
interface FileStorage {
    fun put(accountId: String, key: String, contentType: String, data: InputStream, maxBytes: Long): Long
    fun get(accountId: String, key: String): Pair<String, Path>?
}

class LocalFileStorage(private val root: Path) : FileStorage {
    init {
        Files.createDirectories(root)
    }

    override fun put(accountId: String, key: String, contentType: String, data: InputStream, maxBytes: Long): Long {
        val dir = root.resolve(safe(accountId)).also { Files.createDirectories(it) }
        val tmp = Files.createTempFile(dir, "up-", ".part")
        try {
            var total = 0L
            Files.newOutputStream(tmp).use { out ->
                val buf = ByteArray(64 * 1024)
                while (true) {
                    val n = data.read(buf)
                    if (n < 0) break
                    total += n
                    if (total > maxBytes) throw IllegalArgumentException("file too large")
                    out.write(buf, 0, n)
                }
            }
            Files.move(tmp, dir.resolve(safe(key)), StandardCopyOption.REPLACE_EXISTING)
            Files.writeString(dir.resolve(safe(key) + ".type"), contentType)
            return total
        } finally {
            Files.deleteIfExists(tmp)
        }
    }

    override fun get(accountId: String, key: String): Pair<String, Path>? {
        val f = root.resolve(safe(accountId)).resolve(safe(key))
        if (!Files.isRegularFile(f)) return null
        val type = root.resolve(safe(accountId)).resolve(safe(key) + ".type").let { if (Files.exists(it)) Files.readString(it) else "application/octet-stream" }
        return type to f
    }

    companion object {
        val KEY = Regex("^[A-Za-z0-9_.-]{1,200}$")
        private fun safe(s: String): String {
            require(KEY.matches(s) && s != "." && s != "..") { "bad key" }
            return s
        }
    }
}
