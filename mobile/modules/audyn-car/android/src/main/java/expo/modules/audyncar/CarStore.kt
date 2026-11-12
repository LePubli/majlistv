package expo.modules.audyncar

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Ce que le service Android Auto doit connaître de l'application :
 *  - adresse de l'API, langue, jeton de connexion (chiffré par une clé du coffre Android, jamais en clair sur le téléphone) ;
 *  - positions d'écoute par contenu, au MÊME format que l'application : ["idChapitre", secondes, horodatage ms].
 * L'application et la voiture échangent leurs positions (la plus récente gagne).
 */
class CarStore(context: Context) {
  private val prefs: SharedPreferences = context.applicationContext.getSharedPreferences("audyn_car", Context.MODE_PRIVATE)

  data class Resume(val cid: String, val pos: Long, val at: Long)

  // ------------------------------------------------------------------ session
  fun setSession(apiUrl: String, token: String?, lang: String) {
    val e = prefs.edit().putString("api", apiUrl.trimEnd('/')).putString("lang", lang)
    if (token.isNullOrEmpty()) e.remove("token") else e.putString("token", encrypt(token))
    e.apply()
  }

  val apiUrl: String get() = prefs.getString("api", null) ?: "https://api-majlisstv.le-publicitaire.fr"
  val lang: String get() = prefs.getString("lang", null) ?: "fr"
  val token: String? get() = prefs.getString("token", null)?.let { runCatching { decrypt(it) }.getOrNull() }

  // ------------------------------------------------------------------ positions
  fun get(itemId: String): Resume? = decode(prefs.getString(KEY_POS + itemId, null))

  fun put(itemId: String, raw: String) {
    val r = decode(raw) ?: return
    val cur = get(itemId)
    if (cur == null || r.at >= cur.at) prefs.edit().putString(KEY_POS + itemId, raw).apply()
  }

  fun save(itemId: String, cid: String, posSec: Long) {
    prefs.edit().putString(KEY_POS + itemId, JSONArray().put(cid).put(posSec).put(System.currentTimeMillis()).toString()).apply()
  }

  /** Contenus écoutés, les plus récents d'abord. */
  fun recent(): List<Pair<String, Resume>> =
    prefs.all.entries.filter { it.key.startsWith(KEY_POS) }
      .mapNotNull { e -> decode(e.value as? String)?.let { e.key.removePrefix(KEY_POS) to it } }
      .sortedByDescending { it.second.at }

  /** Reçoit les positions du téléphone (null = aucune), garde la plus récente de chaque côté, renvoie celles de la voiture plus récentes. */
  fun exchange(phone: Map<String, Any?>): Map<String, String> {
    val out = HashMap<String, String>()
    for ((id, v) in phone) {
      val raw = v as? String
      val mine = get(id)
      val theirs = decode(raw)
      if (theirs != null && (mine == null || theirs.at > mine.at)) prefs.edit().putString(KEY_POS + id, raw).apply()
      else if (mine != null && (theirs == null || mine.at > theirs.at)) out[id] = prefs.getString(KEY_POS + id, null) ?: continue
    }
    return out
  }

  // ------------------------------------------------------------------ chiffrement du jeton (coffre Android, AES-GCM)
  private fun key(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    gen.init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    return gen.generateKey()
  }

  private fun encrypt(text: String): String {
    val c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, key())
    val ct = c.doFinal(text.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(c.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP)
  }

  private fun decrypt(stored: String): String {
    val (iv, ct) = stored.split(":", limit = 2).map { Base64.decode(it, Base64.NO_WRAP) }
    val c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
    return String(c.doFinal(ct), Charsets.UTF_8)
  }

  companion object {
    private const val KEY_POS = "pos."
    private const val ALIAS = "mejliss_audyn_car"

    fun decode(raw: String?): Resume? = runCatching {
      val a = JSONArray(raw ?: return null)
      val cid = a.getString(0)
      if (cid.isEmpty()) null else Resume(cid, a.getDouble(1).toLong().coerceAtLeast(0), a.getDouble(2).toLong())
    }.getOrNull()
  }
}
