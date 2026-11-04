package com.hancel.home

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.hancel.home.ui.HomeRoot
import com.hancel.home.ui.tema.HomeTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val deps = (application as HomeApp).deps
        setContent { HomeTheme { HomeRoot(deps) } }
    }
}
