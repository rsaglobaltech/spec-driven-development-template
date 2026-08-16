package com.rsaglobaltech.csda.gradle;

import java.util.ArrayList;
import java.util.List;

import org.gradle.api.provider.Property;
import org.gradle.api.tasks.Input;
import org.gradle.api.tasks.TaskAction;
import org.gradle.api.tasks.options.Option;

/**
 * {@code gradle csdaValidate} — run the Spec-Driven Development gate.
 * Fails the build when a requirement lacks its feature file, its test
 * artifact, or its traceability row. Wired into {@code check} by the plugin
 * so it also runs on {@code gradle check}/{@code build}.
 */
public abstract class CsdaValidateTask extends CsdaTask {

    /** Enforce the strict TDD rules (TDD-1/2/3), not just structure. */
    @Input
    @Option(option = "no-strict-tdd", description = "Run the structural gate only, skipping TDD-1/2/3.")
    public abstract Property<Boolean> getStrictTdd();

    @TaskAction
    public void run() {
        runCli();
    }

    @Override
    protected List<String> cliArgs() {
        List<String> args = new ArrayList<>();
        args.add("validate");
        args.add(".");
        if (getStrictTdd().get()) {
            args.add("--strict-tdd");
        }
        return args;
    }
}
