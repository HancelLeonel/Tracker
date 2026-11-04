package com.hancel.home.ui.comun

import androidx.compose.runtime.Composable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.createSavedStateHandle

/** Crea (o recupera) un ViewModel con acceso a su SavedStateHandle, sin librerías de inyección. */
@Composable
inline fun <reified T : ViewModel> vm(key: String? = null, crossinline create: (SavedStateHandle) -> T): T =
    viewModel(key = key, factory = viewModelFactory { initializer { create(createSavedStateHandle()) } })
