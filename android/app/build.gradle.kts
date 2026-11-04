plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
}

android {
    namespace = "com.hancel.home"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.hancel.home"
        minSdk = 34
        targetSdk = 35
        versionCode = (project.findProperty("home.versionCode") as String).toInt()
        versionName = project.findProperty("home.versionName") as String
    }
    // La firma se lee de ~/.gradle/gradle.properties (fuera del repo). Sin esas propiedades release sale sin firmar.
    val firma = listOf("HOME_STORE_FILE", "HOME_STORE_PASSWORD", "HOME_KEY_ALIAS", "HOME_KEY_PASSWORD")
        .associateWith { project.findProperty(it) as String? }
    signingConfigs {
        if (firma.values.all { it != null }) create("release") {
            storeFile = file(firma.getValue("HOME_STORE_FILE")!!)
            storePassword = firma["HOME_STORE_PASSWORD"]
            keyAlias = firma["HOME_KEY_ALIAS"]
            keyPassword = firma["HOME_KEY_PASSWORD"]
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.findByName("release")
        }
    }
    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    testOptions { unitTests.isIncludeAndroidResources = true }
}
// Las pruebas de interfaz necesitan el manifiesto de prueba de Compose, que solo va en debug; release compila el
// mismo código, así que sus pruebas unitarias solo repetirían las de debug (y fallarían sin ese manifiesto).
androidComponents {
    beforeVariants(selector().withBuildType("release")) { it.enableUnitTest = false }
}
kotlin { jvmToolchain(21) }
ksp { arg("room.schemaLocation", "$projectDir/schemas") }

dependencies {
    implementation(project(":core"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.activity.compose)
    implementation(libs.navigation.compose)
    implementation(libs.reorderable)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)
    implementation(libs.datastore.preferences)
    implementation(libs.coroutines.core)
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.compose.ui.tooling.preview)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.junit)
    testImplementation(libs.coroutines.test)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    debugImplementation(libs.compose.ui.test.manifest)
}
