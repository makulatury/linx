package com.makulatury.linx

import android.content.Context
import android.graphics.Color
import android.os.Bundle
import android.print.PrintAttributes
import android.print.PrintManager
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Тёмные значки на светлом фоне - интерфейс программы всегда светлый
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
    )
    super.onCreate(savedInstanceState)
    // Окно рисуется под строкой состояния и панелью навигации (так требует Android 15+).
    // Отступаем от системных панелей, выреза камеры и экранной клавиатуры, чтобы шапка
    // программы не уходила под часы, а поля ввода не закрывались клавиатурой.
    val root = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout() or
          WindowInsetsCompat.Type.ime()
      )
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
  }

  // window.print() во встроенном браузере Android ничего не делает - печать идёт через системный
  // PrintManager. Страница вызывает LinxAndroid.print(название); в окне печати есть и «Сохранить как PDF».
  override fun onWebViewCreate(webView: WebView) {
    webView.addJavascriptInterface(PrintBridge(this, webView), "LinxAndroid")
  }
}

class PrintBridge(private val activity: MainActivity, private val webView: WebView) {
  @JavascriptInterface
  fun print(title: String?) {
    val name = title?.takeIf { it.isNotBlank() } ?: "Linx"
    activity.runOnUiThread {
      val pm = activity.getSystemService(Context.PRINT_SERVICE) as PrintManager
      val attrs = PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build()
      pm.print(name, webView.createPrintDocumentAdapter(name), attrs)
    }
  }
}
