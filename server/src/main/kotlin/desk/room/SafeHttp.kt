package desk.room

import java.io.ByteArrayOutputStream
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/**
 * 사용자가 준 URL 을 서버가 대신 가져온다. 서버가 내부망을 찌르는 통로(SSRF)가 되지 않도록
 * 매 리다이렉트마다 호스트를 해석해 사설·루프백·링크로컬 주소를 막고, 응답 크기를 제한한다.
 */
class SafeHttp(
    private val allowPrivate: Boolean = false,
    private val timeout: Duration = Duration.ofSeconds(8),
) {
    class Blocked(message: String) : RuntimeException(message)

    data class Fetched(val url: URI, val status: Int, val contentType: String?, val body: ByteArray)

    private val client: HttpClient = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.NEVER)
        .connectTimeout(timeout)
        .build()

    fun get(url: String, maxBytes: Int, accept: String = "*/*"): Fetched {
        var uri = parse(url)
        repeat(MAX_REDIRECTS + 1) {
            check(uri)
            val req = HttpRequest.newBuilder(uri)
                .timeout(timeout)
                .header("User-Agent", USER_AGENT)
                .header("Accept", accept)
                .header("Accept-Language", "ko,en;q=0.8")
                .GET()
                .build()
            val res = client.send(req, HttpResponse.BodyHandlers.ofInputStream())
            if (res.statusCode() in 300..399) {
                res.body().close()
                val loc = res.headers().firstValue("location").orElse(null) ?: throw Blocked("redirect without location")
                uri = parse(uri.resolve(loc).toString())
                return@repeat
            }
            val body = res.body().use { input ->
                val out = ByteArrayOutputStream()
                val buf = ByteArray(16 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    if (out.size() + n > maxBytes) {
                        // HTML 은 앞부분(head)만 있으면 되므로 잘라서 쓴다
                        out.write(buf, 0, maxBytes - out.size())
                        break
                    }
                    out.write(buf, 0, n)
                }
                out.toByteArray()
            }
            return Fetched(uri, res.statusCode(), res.headers().firstValue("content-type").orElse(null), body)
        }
        throw Blocked("too many redirects")
    }

    private fun parse(url: String): URI {
        val u = try { URI(url.trim()) } catch (e: Exception) { throw Blocked("bad url") }
        if (u.scheme?.lowercase() !in setOf("http", "https") || u.host.isNullOrBlank()) throw Blocked("only http(s)")
        return u
    }

    private fun check(uri: URI) {
        if (allowPrivate) return
        val addrs = try { InetAddress.getAllByName(uri.host) } catch (e: Exception) { throw Blocked("unknown host") }
        if (addrs.any { isInternal(it) }) throw Blocked("internal address")
    }

    companion object {
        private const val MAX_REDIRECTS = 5
        const val USER_AGENT = "Mozilla/5.0 (compatible; MessyRoomBot/0.1; +https://example.invalid/bot)"

        fun isInternal(a: InetAddress): Boolean {
            if (a.isLoopbackAddress || a.isAnyLocalAddress || a.isLinkLocalAddress || a.isSiteLocalAddress || a.isMulticastAddress) return true
            val b = a.address
            return when (a) {
                // 100.64.0.0/10 (CGNAT), 0.0.0.0/8
                is Inet4Address -> (b[0].toInt() and 0xff) == 100 && (b[1].toInt() and 0xc0) == 64 || b[0].toInt() == 0
                // fc00::/7 (ULA)
                is Inet6Address -> (b[0].toInt() and 0xfe) == 0xfc
                else -> false
            }
        }
    }
}
