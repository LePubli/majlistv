package expo.modules.audyncar

/** Textes affichés dans la voiture, dans la langue choisie dans l'application (fr / en / ar). */
object CarTexts {
  private val T = mapOf(
    "continue" to mapOf("fr" to "Continuer l'écoute", "en" to "Continue listening", "ar" to "متابعة الاستماع"),
    "all" to mapOf("fr" to "Tout Audyn", "en" to "All of Audyn", "ar" to "كل Audyn"),
    "cats" to mapOf("fr" to "Catégories", "en" to "Categories", "ar" to "الفئات"),
    "empty" to mapOf("fr" to "Rien pour l'instant", "en" to "Nothing yet", "ar" to "لا شيء بعد"),
    "emptyContinue" to mapOf("fr" to "Commencez un livre pour le retrouver ici", "en" to "Start a book to find it here", "ar" to "ابدأ كتابًا لتجده هنا"),
    "preview" to mapOf("fr" to "Aperçu — formule Apprentissage", "en" to "Preview — Learning plan", "ar" to "معاينة — باقة التعلّم"),
    "chapters" to mapOf("fr" to "chapitres", "en" to "chapters", "ar" to "فصول"),
  )

  fun t(lang: String, key: String): String = T[key]?.let { it[lang] ?: it["fr"] } ?: key
}
