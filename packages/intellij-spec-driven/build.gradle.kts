// IntelliJ plugin build. Requires a JDK 17+ and Gradle; not built by the Node
// CI in this repo (see README). It is a thin LSP4IJ client over
// @spec-driven/lsp-server — no spec logic lives here.
plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.24"
    id("org.jetbrains.intellij") version "1.17.4"
}

group = "com.rsaglobaltech"
version = "0.1.0"

repositories {
    mavenCentral()
}

intellij {
    version.set("2024.1")
    type.set("IC") // IntelliJ IDEA Community
    plugins.set(listOf("com.redhat.devtools.lsp4ij:0.7.0"))
}

dependencies {
    // LSP4IJ is supplied by the IntelliJ plugin dependency above.
}

tasks {
    patchPluginXml {
        sinceBuild.set("241")
        untilBuild.set("243.*")
    }
    buildSearchableOptions { enabled = false }
}

kotlin {
    jvmToolchain(17)
}
