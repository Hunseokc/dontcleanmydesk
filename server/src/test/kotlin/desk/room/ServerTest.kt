package desk.room

import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.client.statement.readRawBytes
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.ApplicationTestBuilder
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import java.net.InetAddress
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ServerTest {
    private fun deps(): Deps {
        val http = SafeHttp()
        val db = "jdbc:h2:mem:t${System.nanoTime()};MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
        return Deps(http, LinkMetaService(http), SyncStore(SyncStore.dataSource(db)), LocalFileStorage(Files.createTempDirectory("files")), listOf("*"))
    }

    private fun app(block: suspend ApplicationTestBuilder.() -> Unit) = testApplication {
        application { module(deps()) }
        block()
    }

    private suspend fun ApplicationTestBuilder.newAccount() =
        Json.parseToJsonElement(client.post("/api/accounts").bodyAsText()).jsonObject

    private suspend fun ApplicationTestBuilder.sync(token: String, cursor: Long, changes: String) =
        client.post("/api/sync") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody("""{"cursor":$cursor,"changes":$changes}""")
        }

    @Test
    fun `동기화는 LWW 로 합치고 커서 이후 변경만 돌려준다`() = app {
        val acc = newAccount()
        val token = acc["token"]!!.jsonPrimitive.content

        val first = sync(token, 0, """[{"collection":"items","doc":{"id":"a","updatedAt":10,"content":"v1"}}]""")
        assertEquals(HttpStatusCode.OK, first.status)
        val body1 = Json.parseToJsonElement(first.bodyAsText()).jsonObject
        val cursor1 = body1["cursor"]!!.jsonPrimitive.long
        assertEquals(1, body1["changes"]!!.jsonArray.size)

        // 더 오래된 쓰기는 무시된다
        sync(token, cursor1, """[{"collection":"items","doc":{"id":"a","updatedAt":5,"content":"old"}}]""")
        // 다른 기기(같은 계정, 새 토큰)에서 받으면 v1
        val linked = Json.parseToJsonElement(
            client.post("/api/accounts/link") {
                contentType(ContentType.Application.Json)
                setBody("""{"code":"${acc["code"]!!.jsonPrimitive.content}"}""")
            }.bodyAsText(),
        ).jsonObject
        val other = Json.parseToJsonElement(sync(linked["token"]!!.jsonPrimitive.content, 0, "[]").bodyAsText()).jsonObject
        val doc = other["changes"]!!.jsonArray.single().jsonObject["doc"]!!.jsonObject
        assertEquals("v1", doc["content"]!!.jsonPrimitive.content)

        // 소프트 삭제도 하나의 변경
        val del = Json.parseToJsonElement(sync(token, cursor1, """[{"collection":"items","doc":{"id":"a","updatedAt":20,"deletedAt":20,"content":"v1"}}]""").bodyAsText()).jsonObject
        assertEquals(20, del["changes"]!!.jsonArray.single().jsonObject["doc"]!!.jsonObject["deletedAt"]!!.jsonPrimitive.long)
    }

    @Test
    fun `토큰 없이는 동기화할 수 없고 계정끼리 섞이지 않는다`() = app {
        assertEquals(HttpStatusCode.Unauthorized, sync("nope", 0, "[]").status)
        val a = newAccount()["token"]!!.jsonPrimitive.content
        val b = newAccount()["token"]!!.jsonPrimitive.content
        sync(a, 0, """[{"collection":"bins","doc":{"id":"x","updatedAt":1}}]""")
        val seen = Json.parseToJsonElement(sync(b, 0, "[]").bodyAsText()).jsonObject["changes"]!!.jsonArray
        assertTrue(seen.isEmpty())
        assertEquals(HttpStatusCode.BadRequest, sync(a, 0, """[{"collection":"evil","doc":{"id":"x","updatedAt":1}}]""").status)
    }

    @Test
    fun `파일은 계정별로 저장하고 내려받는다`() = app {
        val token = newAccount()["token"]!!.jsonPrimitive.content
        val bytes = byteArrayOf(1, 2, 3, 4)
        val put = client.put("/api/files/thumb_a_1") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Image.PNG)
            setBody(bytes)
        }
        assertEquals(HttpStatusCode.NoContent, put.status)
        val got = client.get("/api/files/thumb_a_1") { header(HttpHeaders.Authorization, "Bearer $token") }
        assertEquals(ContentType.Image.PNG, got.headers[HttpHeaders.ContentType]?.let(ContentType::parse))
        assertTrue(bytes.contentEquals(got.readRawBytes()))
        val other = newAccount()["token"]!!.jsonPrimitive.content
        assertEquals(HttpStatusCode.NotFound, client.get("/api/files/thumb_a_1") { header(HttpHeaders.Authorization, "Bearer $other") }.status)
        assertEquals(HttpStatusCode.BadRequest, client.put("/api/files/..") { header(HttpHeaders.Authorization, "Bearer $token"); setBody(bytes) }.status)
    }

    @Test
    fun `내부 주소로는 가져오지 않는다`() = app {
        assertEquals(HttpStatusCode.BadRequest, client.get("/api/meta?url=http://127.0.0.1:22/").status)
        assertEquals(HttpStatusCode.BadRequest, client.get("/api/image?url=file:///etc/passwd").status)
        assertTrue(SafeHttp.isInternal(InetAddress.getByName("10.1.2.3")))
        assertTrue(SafeHttp.isInternal(InetAddress.getByName("169.254.169.254")))
        assertTrue(!SafeHttp.isInternal(InetAddress.getByName("93.184.216.34")))
        assertFailsWith<SafeHttp.Blocked> { SafeHttp().get("http://localhost/", 10) }
    }

    @Test
    fun `OG 메타데이터를 읽고 상대 경로 이미지를 풀어낸다`() {
        val html = """<html><head><title>제목</title>
            <meta property="og:title" content="오래된 지도">
            <meta property="og:image" content="/img/map.jpg">
            <meta name="description" content="손글씨 메모">
            </head><body></body></html>"""
        val m = LinkMetaService.parseHtml("https://ex.com/a", "https://ex.com/a/b", html)
        assertEquals("오래된 지도", m.title)
        assertEquals("https://ex.com/img/map.jpg", m.image)
        assertEquals("og", m.imageSource)
        assertEquals("손글씨 메모", m.description)
        assertNull(LinkMetaService.parseHtml("u", "https://ex.com", "<title>t</title>").image)
        assertEquals("dQw4w9WgXcQ", LinkMetaService.youtubeId("https://youtu.be/dQw4w9WgXcQ"))
        assertNull(LinkMetaService.youtubeId("https://music.youtube.com/watch?v=x"))
    }
}
