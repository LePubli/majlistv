package expo.modules.audyncar

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Passerelle appelée par l'application (JavaScript) : session et positions d'écoute partagées avec Android Auto. */
class AudynCarModule : Module() {
  private val store: CarStore
    get() = CarStore(appContext.reactContext ?: throw Exceptions.ReactContextLost())

  override fun definition() = ModuleDefinition {
    Name("AudynCar")

    Function("setSession") { apiUrl: String, token: String?, lang: String ->
      store.setSession(apiUrl, token, lang)
    }

    Function("exchange") { saved: Map<String, Any?> ->
      store.exchange(saved)
    }

    Function("put") { itemId: String, raw: String ->
      store.put(itemId, raw)
    }
  }
}
