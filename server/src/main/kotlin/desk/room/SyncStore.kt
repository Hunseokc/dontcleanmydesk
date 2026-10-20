package desk.room

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.security.MessageDigest
import java.security.SecureRandom
import java.sql.Connection
import java.util.Base64
import java.util.UUID
import javax.sql.DataSource

@Serializable
data class Change(val collection: String, val doc: JsonObject)

@Serializable
data class SyncRequest(val cursor: Long = 0, val changes: List<Change> = emptyList())

@Serializable
data class SyncResponse(val cursor: Long, val changes: List<Change>)

@Serializable
data class Account(val accountId: String, val token: String, val code: String)

@Serializable
data class LinkRequest(val code: String)

/**
 * 동기화 저장소. 클라이언트 엔티티(items·bins·rooms)를 JSON 문서로 보관하고 LWW(updatedAt 큰 쪽 우선)로 합친다.
 * 모든 엔티티는 updatedAt 과 소프트 삭제(deletedAt)를 가지므로 삭제도 그냥 하나의 변경이다.
 * 기본은 H2 파일 DB, DB_URL 로 PostgreSQL 을 쓴다.
 */
class SyncStore(private val ds: DataSource) {
    private val json = Json

    init {
        ds.connection.use { c ->
            c.createStatement().use { s ->
                s.execute("CREATE TABLE IF NOT EXISTS accounts (id VARCHAR(64) PRIMARY KEY, code VARCHAR(16) NOT NULL UNIQUE, created_at BIGINT NOT NULL)")
                s.execute("CREATE TABLE IF NOT EXISTS tokens (token_hash VARCHAR(64) PRIMARY KEY, account_id VARCHAR(64) NOT NULL, created_at BIGINT NOT NULL)")
                s.execute(
                    "CREATE TABLE IF NOT EXISTS docs (account_id VARCHAR(64) NOT NULL, collection VARCHAR(16) NOT NULL, id VARCHAR(128) NOT NULL, " +
                        "updated_at BIGINT NOT NULL, deleted_at BIGINT, seq BIGINT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (account_id, collection, id))",
                )
                s.execute("CREATE INDEX IF NOT EXISTS docs_by_seq ON docs (account_id, seq)")
                s.execute("CREATE SEQUENCE IF NOT EXISTS doc_seq")
            }
        }
    }

    // ---------- 계정: 이메일 대신 연결 코드. 다른 기기에서 코드를 입력하면 같은 계정의 새 토큰을 받는다 ----------

    fun createAccount(): Account = tx { c ->
        val id = UUID.randomUUID().toString()
        val code = newCode()
        c.prepareStatement("INSERT INTO accounts (id, code, created_at) VALUES (?, ?, ?)").use {
            it.setString(1, id); it.setString(2, code); it.setLong(3, System.currentTimeMillis()); it.executeUpdate()
        }
        Account(id, issueToken(c, id), code)
    }

    fun link(code: String): Account? = tx { c ->
        val id = c.prepareStatement("SELECT id FROM accounts WHERE code = ?").use {
            it.setString(1, code.trim().uppercase())
            it.executeQuery().use { r -> if (r.next()) r.getString(1) else null }
        } ?: return@tx null
        Account(id, issueToken(c, id), code.trim().uppercase())
    }

    fun accountFor(token: String): String? = ds.connection.use { c ->
        c.prepareStatement("SELECT account_id FROM tokens WHERE token_hash = ?").use {
            it.setString(1, sha256(token))
            it.executeQuery().use { r -> if (r.next()) r.getString(1) else null }
        }
    }

    // ---------- 동기화 ----------

    fun sync(accountId: String, req: SyncRequest): SyncResponse = tx { c ->
        for (ch in req.changes) {
            require(ch.collection in COLLECTIONS) { "unknown collection ${ch.collection}" }
            val id = ch.doc["id"]?.jsonPrimitive?.content ?: throw IllegalArgumentException("doc without id")
            require(id.length <= 128) { "id too long" }
            val updatedAt = ch.doc["updatedAt"]?.jsonPrimitive?.longOrNull ?: throw IllegalArgumentException("doc without updatedAt")
            val deletedAt = ch.doc["deletedAt"]?.jsonPrimitive?.longOrNull
            val current = c.prepareStatement("SELECT updated_at FROM docs WHERE account_id = ? AND collection = ? AND id = ?").use {
                it.setString(1, accountId); it.setString(2, ch.collection); it.setString(3, id)
                it.executeQuery().use { r -> if (r.next()) r.getLong(1) else null }
            }
            if (current != null && current >= updatedAt) continue // 마지막 쓰기 우선
            val seq = nextSeq(c)
            val body = json.encodeToString(JsonObject.serializer(), ch.doc)
            val sql = if (current == null) {
                "INSERT INTO docs (updated_at, deleted_at, seq, body, account_id, collection, id) VALUES (?, ?, ?, ?, ?, ?, ?)"
            } else {
                "UPDATE docs SET updated_at = ?, deleted_at = ?, seq = ?, body = ? WHERE account_id = ? AND collection = ? AND id = ?"
            }
            c.prepareStatement(sql).use {
                it.setLong(1, updatedAt)
                if (deletedAt == null) it.setNull(2, java.sql.Types.BIGINT) else it.setLong(2, deletedAt)
                it.setLong(3, seq); it.setString(4, body)
                it.setString(5, accountId); it.setString(6, ch.collection); it.setString(7, id)
                it.executeUpdate()
            }
        }
        // 커서 이후 바뀐 것 전부(방금 올린 것 포함 — 클라이언트에서 LWW 로 무시된다)
        val out = mutableListOf<Change>()
        var cursor = req.cursor
        c.prepareStatement("SELECT collection, body, seq FROM docs WHERE account_id = ? AND seq > ? ORDER BY seq LIMIT ?").use {
            it.setString(1, accountId); it.setLong(2, req.cursor); it.setInt(3, PAGE)
            it.executeQuery().use { r ->
                while (r.next()) {
                    out += Change(r.getString(1), json.parseToJsonElement(r.getString(2)) as JsonObject)
                    cursor = maxOf(cursor, r.getLong(3))
                }
            }
        }
        SyncResponse(cursor, out)
    }

    private fun nextSeq(c: Connection): Long =
        c.createStatement().use { s -> s.executeQuery("SELECT nextval('doc_seq')").use { r -> r.next(); r.getLong(1) } }

    private fun issueToken(c: Connection, accountId: String): String {
        val token = randomToken()
        c.prepareStatement("INSERT INTO tokens (token_hash, account_id, created_at) VALUES (?, ?, ?)").use {
            it.setString(1, sha256(token)); it.setString(2, accountId); it.setLong(3, System.currentTimeMillis()); it.executeUpdate()
        }
        return token
    }

    private fun <T> tx(block: (Connection) -> T): T = ds.connection.use { c ->
        c.autoCommit = false
        try {
            block(c).also { c.commit() }
        } catch (e: Throwable) {
            c.rollback()
            throw e
        }
    }

    companion object {
        val COLLECTIONS = setOf("items", "bins", "rooms")
        private const val PAGE = 5000
        private val rng = SecureRandom()
        // 헷갈리는 글자(0/O, 1/I/L) 제외
        private const val CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

        fun newCode() = (1..8).map { CODE_ALPHABET[rng.nextInt(CODE_ALPHABET.length)] }.joinToString("")
        fun randomToken(): String = ByteArray(32).also(rng::nextBytes).let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }
        fun sha256(s: String): String = MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }

        fun dataSource(url: String, user: String? = null, password: String? = null): DataSource =
            HikariDataSource(HikariConfig().apply {
                jdbcUrl = url
                user?.let { username = it }
                password?.let { this.password = it }
                maximumPoolSize = 8
            })
    }
}
