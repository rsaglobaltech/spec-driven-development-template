package com.rsaglobaltech.csda.gradle;

import java.io.File;

import org.gradle.api.provider.Property;

/**
 * {@code csda { }} configuration block. Every knob can also be overridden on
 * the command line with the matching {@code -Pcsda.*} project property.
 *
 * <pre>
 * csda {
 *   version = '0.1.4'          // pin the CLI version in CI
 *   launcher = 'docker'        // force docker in air-gapped runners
 *   dockerImage = 'registry.internal/csda'
 *   strictTdd = true
 * }
 * </pre>
 */
public abstract class CsdaExtension {

    /** CLI version to run (npx tag or docker tag). Default {@code latest}. */
    public abstract Property<String> getVersion();

    /** How to launch the CLI: auto | npx | docker. Default {@code auto}. */
    public abstract Property<String> getLauncher();

    /** Docker image used by the docker launcher. */
    public abstract Property<String> getDockerImage();

    /** Directory the CLI operates on (the repo root for multi-project builds). */
    public abstract Property<File> getProjectDir();

    /** Enforce the strict TDD rules for {@code csdaValidate}. Default {@code true}. */
    public abstract Property<Boolean> getStrictTdd();

    /** Output format for {@code csdaPlan}: text | json. Default {@code text}. */
    public abstract Property<String> getFormat();
}
