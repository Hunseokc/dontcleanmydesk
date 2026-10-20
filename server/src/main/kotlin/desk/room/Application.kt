package desk.room

import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.http.content.LocalPathContent
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.calllogging.CallLogging
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.request.header
import io.ktor.server.request.receive
import io.ktor.server.request.receiveChannel
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import io.ktor.utils.io.jvm.javaio.toInputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.slf4j.LoggerFactory
import java.nio.file.Path

@Serializable
data class ErrorBody(val error: String)

class Unauthorized : RuntimeException("unauthorized")

/** 서버는 브라우저가 못 하는 일(외부 링크 메타데이터, API 키 보호)과 동기화만 맡는다. 그래서 작게 시작한다. */
class Deps(
    val http: SafeHttp,
    val meta: LinkMetaService,
    val store: SyncStore,
    val files: FileStorage,
    val corsOrigins: List<String>,
) {
    companion object {
        fun fromEnv(): Deps {
            val env = System.getenv()
            val http = SafeHttp(allowPrivate = env["ALLOW_PRIVATE_FETCH"] == "true")
            val ds = SyncStore.dataSource(
                env["DB_URL"] ?: "jdbc:h2:file:./data/messy-room;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE",
                env["DB_USER"],
                env["DB_PASSWORD"],
            )
            return Deps(
                http = http,
                meta = LinkMetaService(http),
                store = SyncStore(ds),
                files = LocalFileStorage(Path.of(env["FILES_DIR"] ?: "./data/files")),
                corsOrigins = (env["CORS_ORIGINS"] ?: "*").split(',').map { it.trim() }.filter { it.isNotEmpty() },
            )
        }
    }
}

private const val MAX_IMAGE = 8 * 1024 * 1024
private const val MAX_FILE = 200L * 1024 * 1024
private val log = LoggerFactory.getLogger("desk.room")

fun main() {
    val port = System.getenv("PORT")?.toIntOrNull() ?: 8787
    embeddedServer(Netty, port = port, host = System.getenv("HOST") ?: "0.0.0.0") { module(Deps.fromEnv()) }.start(wait = true)
}

fun Application.module(deps: Deps) {
    install(CallLogging)
    install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true; explicitNulls = false }) }
    install(CORS) {
        if ("*" in deps.corsOrigins) anyHost() else deps.corsOrigins.forEach { allowHost(it.substringAfter("://"), listOf(it.substringBefore("://"))) }
        allowHeader(HttpHeaders.Authorization)
        allowHeader(HttpHeaders.ContentType)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Post)
    }
    install(StatusPages) {
        exception<Unauthorized> { call, _ -> call.respond(HttpStatusCode.Unauthorized, ErrorBody("인증이 필요합니다")) }
        exception<SafeHttp.Blocked> { call, e -> call.respond(HttpStatusCode.BadRequest, ErrorBody(e.message ?: "blocked")) }
        exception<IllegalArgumentException> { call, e -> call.respond(HttpStatusCode.BadRequest, ErrorBody(e.message ?: "bad request")) }
        exception<java.io.IOException> { call, e -> call.respond(HttpStatusCode.BadGateway, ErrorBody(e.message ?: "upstream failed")) }
        exception<Throwable> { call, e ->
            log.error("unhandled", e)
            call.respond(HttpStatusCode.InternalServerError, ErrorBody("server error"))
        }
    }

    suspend fun ApplicationCall.account(): String {
        val token = request.header(HttpHeaders.Authorization)?.removePrefix("Bearer ")?.trim() ?: throw Unauthorized()
        return withContext(Dispatchers.IO) { deps.store.accountFor(token) } ?: throw Unauthorized()
    }

    fun ApplicationCall.urlParam(): String = request.queryParameters["url"]?.takeIf { it.isNotBlank() } ?: throw IllegalArgumentException("url 이 필요합니다")

    routing {
        get("/health") { call.respondText("ok") }

        route("/api") {
            // 링크 미리보기 메타데이터 (og:image → oEmbed)
            get("/meta") {
                val url = call.urlParam()
                call.respond(withContext(Dispatchers.IO) { deps.meta.fetch(url) })
            }

            // CORS 없이 외부 이미지를 가져온다(썸네일 저장용)
            get("/image") {
                val url = call.urlParam()
                val res = withContext(Dispatchers.IO) { deps.http.get(url, MAX_IMAGE, "image/avif,image/webp,image/*;q=0.9") }
                val type = res.contentType?.substringBefore(';')?.trim()?.lowercase()
                if (res.status !in 200..299 || type == null || !type.startsWith("image/")) {
                    call.respond(HttpStatusCode.BadGateway, ErrorBody("not an image"))
                    return@get
                }
                call.response.header(HttpHeaders.CacheControl, "public, max-age=86400")
                call.respondBytes(res.body, ContentType.parse(type))
            }

            post("/accounts") { call.respond(withContext(Dispatchers.IO) { deps.store.createAccount() }) }

            post("/accounts/link") {
                val req = call.receive<LinkRequest>()
                val acc = withContext(Dispatchers.IO) { deps.store.link(req.code) }
                if (acc == null) call.respond(HttpStatusCode.NotFound, ErrorBody("연결 코드를 찾을 수 없습니다")) else call.respond(acc)
            }

            post("/sync") {
                val account = call.account()
                val req = call.receive<SyncRequest>()
                call.respond(withContext(Dispatchers.IO) { deps.store.sync(account, req) })
            }

            put("/files/{key}") {
                val account = call.account()
                val key = call.parameters["key"]!!
                val type = call.request.header(HttpHeaders.ContentType) ?: "application/octet-stream"
                val stream = call.receiveChannel().toInputStream()
                withContext(Dispatchers.IO) { deps.files.put(account, key, type, stream, MAX_FILE) }
                call.respond(HttpStatusCode.NoContent)
            }

            get("/files/{key}") {
                val account = call.account()
                val found = withContext(Dispatchers.IO) { deps.files.get(account, call.parameters["key"]!!) }
                if (found == null) {
                    call.respond(HttpStatusCode.NotFound, ErrorBody("not found"))
                    return@get
                }
                call.response.header(HttpHeaders.CacheControl, "private, max-age=31536000, immutable")
                call.respond(LocalPathContent(found.second, ContentType.parse(found.first)))
            }
        }
    }
}
