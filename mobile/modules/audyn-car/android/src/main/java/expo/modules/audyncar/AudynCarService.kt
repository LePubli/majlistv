package expo.modules.audyncar

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.LibraryParams
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionError
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.ListeningExecutorService
import com.google.common.util.concurrent.MoreExecutors
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Audyn dans Android Auto (et dans les autres lecteurs « média » d'Android : montre, commandes du système).
 *
 * Arborescence affichée dans la voiture :
 *   Continuer l'écoute · Tout Audyn · Catégories → une catégorie → livres
 * Toucher un livre le lance là où on s'était arrêté (position partagée avec l'application), chapitres en file d'attente
 * (chapitre précédent / suivant avec les boutons du volant). Sans formule « Apprentissage » : aperçu du premier chapitre, comme
 * dans l'application (le serveur coupe le fichier). La commande vocale « Écouter … sur Mejliss TV » cherche dans Audyn.
 *
 * Identifiants : root · continue · all · cats · cat:<nom> · book:<id> · ch:<id>:<idChapitre>
 * Le lien du fichier est demandé à l'API au moment de lire (ResolvingDataSource), gardé 50 min (les liens durent 1 h).
 */
@OptIn(UnstableApi::class)
class AudynCarService : MediaLibraryService() {
  private lateinit var store: CarStore
  private lateinit var api: AudynApi
  private lateinit var player: ExoPlayer
  private var session: MediaLibrarySession? = null
  private val io: ListeningExecutorService = MoreExecutors.listeningDecorator(Executors.newFixedThreadPool(2))
  private val urls = ConcurrentHashMap<String, Pair<String, Long>>()
  private val main = Handler(Looper.getMainLooper())

  override fun onCreate() {
    super.onCreate()
    store = CarStore(this)
    api = AudynApi(store)

    val resolver = ResolvingDataSource.Resolver { spec: DataSpec ->
      val u = spec.uri
      if (u.scheme != "audyn") spec else {
        val parts = u.pathSegments // audyn://ch/<id>/<cid>
        val key = parts.joinToString("/")
        val cached = urls[key]
        val url = if (cached != null && cached.second > System.currentTimeMillis()) cached.first
          else api.playUrl(parts[0], parts[1]).also { urls[key] = it to System.currentTimeMillis() + 50 * 60_000L }
        spec.withUri(Uri.parse(url))
      }
    }
    val http = DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(true).setConnectTimeoutMs(15_000).setReadTimeoutMs(20_000)
    val sources = DefaultMediaSourceFactory(ResolvingDataSource.Factory(DefaultDataSource.Factory(this, http), resolver))

    player = ExoPlayer.Builder(this)
      .setMediaSourceFactory(sources)
      .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build(), true)
      .setHandleAudioBecomingNoisy(true)
      .setSeekBackIncrementMs(15_000)
      .setSeekForwardIncrementMs(15_000)
      .build()
    player.addListener(object : Player.Listener {
      override fun onIsPlayingChanged(isPlaying: Boolean) { savePosition() }
      override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) { savePosition() }
      override fun onPlaybackStateChanged(state: Int) {
        // Livre fini : retour au début (comme dans l'application) ; il quitte « Continuer l'écoute ».
        if (state == Player.STATE_ENDED && player.mediaItemCount > 0) ids(player.getMediaItemAt(0).mediaId)?.let { (id, cid) -> store.save(id, cid, 0) }
      }
    })

    val launch = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    session = MediaLibrarySession.Builder(this, player, LibraryCallback()).apply { launch?.let { setSessionActivity(it) } }.build()
    main.postDelayed(ticker, 10_000)
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

  override fun onTaskRemoved(rootIntent: Intent?) {
    if (!player.playWhenReady || player.mediaItemCount == 0) stopSelf()
  }

  override fun onDestroy() {
    savePosition()
    main.removeCallbacks(ticker)
    session?.release(); session = null
    player.release()
    io.shutdown()
    super.onDestroy()
  }

  // ------------------------------------------------------------------ positions (toutes les 10 s pendant la lecture)
  private val ticker = object : Runnable {
    override fun run() {
      if (player.isPlaying) savePosition()
      main.postDelayed(this, 10_000)
    }
  }

  private fun ids(mediaId: String): Pair<String, String>? =
    mediaId.split(":", limit = 3).takeIf { it.size == 3 && it[0] == "ch" }?.let { it[1] to it[2] }

  private fun savePosition() {
    val (id, cid) = player.currentMediaItem?.mediaId?.let { ids(it) } ?: return
    if (player.playbackState == Player.STATE_ENDED) return
    store.save(id, cid, player.currentPosition / 1000)
  }

  // ------------------------------------------------------------------ éléments affichés
  private fun t(key: String) = CarTexts.t(store.lang, key)

  private fun folder(id: String, title: String, grid: Boolean = false): MediaItem {
    val extras = Bundle().apply {
      putInt(STYLE_PLAYABLE, if (grid) STYLE_GRID else STYLE_LIST)
      putInt(STYLE_BROWSABLE, STYLE_LIST)
    }
    return MediaItem.Builder().setMediaId(id).setMediaMetadata(
      MediaMetadata.Builder().setTitle(title).setIsBrowsable(true).setIsPlayable(false)
        .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED).setExtras(extras).build()).build()
  }

  private fun info(text: String) = MediaItem.Builder().setMediaId("info").setMediaMetadata(
    MediaMetadata.Builder().setTitle(text).setIsBrowsable(false).setIsPlayable(false).build()).build()

  private fun bookItem(b: AudynApi.Book): MediaItem = MediaItem.Builder().setMediaId("book:" + b.id).setMediaMetadata(
    MediaMetadata.Builder().setTitle(b.title)
      .setSubtitle(if (b.full) b.author.ifEmpty { b.narrator } else t("preview"))
      .setArtist(b.author.ifEmpty { b.narrator })
      .setArtworkUri(b.cover?.let { Uri.parse(it) })
      .setIsBrowsable(false).setIsPlayable(true)
      .setMediaType(MediaMetadata.MEDIA_TYPE_AUDIO_BOOK).build()).build()

  private fun chapterItems(d: AudynApi.Detail): List<MediaItem> = d.chapters.filter { it.playable }.map { c ->
    MediaItem.Builder().setMediaId("ch:${d.book.id}:${c.id}")
      .setUri(Uri.parse("audyn://ch/${d.book.id}/${c.id}"))
      .setMediaMetadata(MediaMetadata.Builder().setTitle(c.title).setArtist(d.book.title).setAlbumTitle(d.book.title)
        .setAlbumArtist(d.book.author.ifEmpty { d.book.narrator }).setArtworkUri(d.book.cover?.let { Uri.parse(it) })
        .setIsBrowsable(false).setIsPlayable(true).setMediaType(MediaMetadata.MEDIA_TYPE_AUDIO_BOOK_CHAPTER).build())
      .build()
  }

  private fun children(parentId: String): List<MediaItem> = when {
    parentId == ROOT -> listOf(folder(CONTINUE, t("continue"), grid = true), folder(ALL, t("all"), grid = true), folder(CATS, t("cats")))
    parentId == CONTINUE -> {
      val (books, _) = api.list()
      val byId = books.associateBy { it.id }
      store.recent().filter { it.second.pos >= 5 }.mapNotNull { byId[it.first] }.take(8).map { bookItem(it) }.ifEmpty { listOf(info(t("emptyContinue"))) }
    }
    parentId == ALL -> api.list().first.map { bookItem(it) }.ifEmpty { listOf(info(t("empty"))) }
    parentId == CATS -> api.list().second.map { folder("cat:$it", it, grid = true) }.ifEmpty { listOf(info(t("empty"))) }
    parentId.startsWith("cat:") -> api.list(category = parentId.removePrefix("cat:")).first.map { bookItem(it) }.ifEmpty { listOf(info(t("empty"))) }
    else -> emptyList()
  }

  /** Livre (ou chapitre) demandé → chapitres en file d'attente, départ au point d'arrêt. */
  private fun queueFor(mediaId: String, searchQuery: String?): MediaSession.MediaItemsWithStartPosition {
    val bookId = when {
      mediaId.startsWith("book:") -> mediaId.removePrefix("book:")
      mediaId.startsWith("ch:") -> ids(mediaId)?.first
      !searchQuery.isNullOrBlank() -> api.list(query = searchQuery).first.firstOrNull()?.id
      else -> store.recent().firstOrNull()?.first // « Lecture » sans rien choisir : dernier livre écouté
    } ?: throw AudynApi.HttpError(404)
    val d = api.detail(bookId)
    val items = chapterItems(d)
    if (items.isEmpty()) throw AudynApi.HttpError(403)
    val wanted = ids(mediaId)?.second
    val saved = store.get(bookId)
    val target = wanted ?: saved?.cid
    val index = items.indexOfFirst { it.mediaId == "ch:$bookId:$target" }.coerceAtLeast(0)
    val startMs = if (wanted == null && saved != null && items[index].mediaId == "ch:$bookId:${saved.cid}") maxOf(0L, saved.pos - 3) * 1000 else 0L
    return MediaSession.MediaItemsWithStartPosition(items, index, startMs)
  }

  private inner class LibraryCallback : MediaLibrarySession.Callback {
    override fun onGetLibraryRoot(
      session: MediaLibrarySession, browser: MediaSession.ControllerInfo, params: LibraryParams?,
    ): ListenableFuture<LibraryResult<MediaItem>> {
      val extras = Bundle().apply { putBoolean(SEARCH_SUPPORTED, true); putInt(STYLE_BROWSABLE, STYLE_LIST); putInt(STYLE_PLAYABLE, STYLE_GRID) }
      val root = MediaItem.Builder().setMediaId(ROOT).setMediaMetadata(
        MediaMetadata.Builder().setTitle("Audyn").setIsBrowsable(true).setIsPlayable(false).build()).build()
      return Futures.immediateFuture(LibraryResult.ofItem(root, LibraryParams.Builder().setExtras(extras).build()))
    }

    override fun onGetChildren(
      session: MediaLibrarySession, browser: MediaSession.ControllerInfo, parentId: String, page: Int, pageSize: Int, params: LibraryParams?,
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = io.submit<LibraryResult<ImmutableList<MediaItem>>> {
      try {
        val all = children(parentId)
        val from = (page.toLong() * pageSize).coerceAtMost(all.size.toLong()).toInt()
        val to = (from.toLong() + pageSize).coerceAtMost(all.size.toLong()).toInt()
        LibraryResult.ofItemList(if (pageSize > 0) all.subList(from, to) else all, params)
      } catch (e: Exception) {
        LibraryResult.ofError(SessionError.ERROR_IO)
      }
    }

    override fun onGetItem(
      session: MediaLibrarySession, browser: MediaSession.ControllerInfo, mediaId: String,
    ): ListenableFuture<LibraryResult<MediaItem>> = io.submit<LibraryResult<MediaItem>> {
      try {
        val id = mediaId.removePrefix("book:")
        LibraryResult.ofItem(bookItem(api.detail(id).book), null)
      } catch (e: Exception) {
        LibraryResult.ofError(SessionError.ERROR_BAD_VALUE)
      }
    }

    override fun onSearch(
      session: MediaLibrarySession, browser: MediaSession.ControllerInfo, query: String, params: LibraryParams?,
    ): ListenableFuture<LibraryResult<Void>> {
      io.execute {
        val n = runCatching { api.list(query = query).first.size }.getOrDefault(0)
        session.notifySearchResultChanged(browser, query, n, params)
      }
      return Futures.immediateFuture(LibraryResult.ofVoid())
    }

    override fun onGetSearchResult(
      session: MediaLibrarySession, browser: MediaSession.ControllerInfo, query: String, page: Int, pageSize: Int, params: LibraryParams?,
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = io.submit<LibraryResult<ImmutableList<MediaItem>>> {
      try { LibraryResult.ofItemList(api.list(query = query).first.map { bookItem(it) }, params) }
      catch (e: Exception) { LibraryResult.ofError(SessionError.ERROR_IO) }
    }

    override fun onSetMediaItems(
      mediaSession: MediaSession, controller: MediaSession.ControllerInfo, mediaItems: MutableList<MediaItem>, startIndex: Int, startPositionMs: Long,
    ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
      val first = mediaItems.getOrNull(startIndex.coerceAtLeast(0)) ?: mediaItems.firstOrNull()
      // Éléments déjà prêts (adresse audyn://) : rien à résoudre.
      if (first != null && first.localConfiguration != null) {
        return Futures.immediateFuture(MediaSession.MediaItemsWithStartPosition(mediaItems, startIndex, startPositionMs))
      }
      return io.submit<MediaSession.MediaItemsWithStartPosition> {
        queueFor(first?.mediaId.orEmpty(), first?.requestMetadata?.searchQuery)
      }
    }

    override fun onAddMediaItems(
      mediaSession: MediaSession, controller: MediaSession.ControllerInfo, mediaItems: MutableList<MediaItem>,
    ): ListenableFuture<MutableList<MediaItem>> = io.submit<MutableList<MediaItem>> {
      mediaItems.flatMap { m -> if (m.localConfiguration != null) listOf(m) else queueFor(m.mediaId, m.requestMetadata.searchQuery).mediaItems }.toMutableList()
    }
  }

  companion object {
    private const val ROOT = "root"
    private const val CONTINUE = "continue"
    private const val ALL = "all"
    private const val CATS = "cats"
    // Indications d'affichage lues par Android Auto (liste ou grille de couvertures) et recherche vocale.
    private const val STYLE_BROWSABLE = "android.media.browse.CONTENT_STYLE_BROWSABLE_HINT"
    private const val STYLE_PLAYABLE = "android.media.browse.CONTENT_STYLE_PLAYABLE_HINT"
    private const val SEARCH_SUPPORTED = "android.media.browse.SEARCH_SUPPORTED"
    private const val STYLE_LIST = 1
    private const val STYLE_GRID = 2
  }
}
