package expo.modules.audyncar

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** Lecture de l'API Audyn publique (mêmes adresses que l'application). Appels bloquants : toujours hors du fil principal. */
class AudynApi(private val store: CarStore) {
  data class Book(val id: String, val title: String, val author: String, val narrator: String, val category: String, val cover: String?, val full: Boolean)
  data class Chapter(val id: String, val title: String, val playable: Boolean, val durationSeconds: Int)
  data class Detail(val book: Book, val chapters: List<Chapter>)

  class HttpError(val code: Int) : Exception("HTTP $code")

  private fun get(path: String, auth: Boolean = true): JSONObject {
    val conn = URL(store.apiUrl + path).openConnection() as HttpURLConnection
    conn.connectTimeout = 10_000; conn.readTimeout = 15_000
    conn.setRequestProperty("Accept", "application/json")
    if (auth) store.token?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
    try {
      val code = conn.responseCode
      if (code == 401 && auth && store.token != null) return get(path, false) // jeton expiré : on continue comme visiteur (aperçus)
      if (code !in 200..299) throw HttpError(code)
      return JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
    } finally { conn.disconnect() }
  }

  private fun abs(u: String?): String? = when {
    u.isNullOrEmpty() -> null
    u.startsWith("http") -> u
    else -> store.apiUrl + (if (u.startsWith("/")) u else "/$u")
  }

  private fun book(o: JSONObject) = Book(
    o.getString("id"), o.optString("title"), o.optString("author"), o.optString("narrator"), o.optString("category"),
    abs(o.optString("coverUrl").takeIf { it.isNotEmpty() && it != "null" }), o.optBoolean("full", false),
  )

  fun list(category: String? = null, query: String? = null): Pair<List<Book>, List<String>> {
    val q = buildList {
      category?.let { add("category=" + URLEncoder.encode(it, "UTF-8")) }
      query?.let { add("q=" + URLEncoder.encode(it.take(80), "UTF-8")) }
    }.joinToString("&")
    val o = get("/audyn" + if (q.isEmpty()) "" else "?$q")
    val items = o.getJSONArray("items").let { a -> (0 until a.length()).map { book(a.getJSONObject(it)) } }
    val cats = o.optJSONArray("categories")?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()
    return items to cats
  }

  fun detail(id: String): Detail {
    val o = get("/audyn/" + URLEncoder.encode(id, "UTF-8"))
    val full = o.optJSONObject("access")?.optBoolean("full", false) ?: false
    val chapters = o.getJSONArray("chapters").let { a ->
      (0 until a.length()).map { i -> a.getJSONObject(i).let { c -> Chapter(c.getString("id"), c.optString("title"), c.optBoolean("playable", false), c.optInt("durationSeconds")) } }
    }
    o.put("full", full)
    return Detail(book(o), chapters)
  }

  /** Lien d'écoute d'un chapitre : lien signé (1 h) ou aperçu coupé par le serveur. */
  fun playUrl(id: String, cid: String): String {
    val o = get("/audyn/" + URLEncoder.encode(id, "UTF-8") + "/chapters/" + URLEncoder.encode(cid, "UTF-8") + "/play")
    return abs(o.getString("url")) ?: throw HttpError(500)
  }
}
