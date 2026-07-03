package com.rsaglobaltech.csda.gradle;

import java.util.ArrayList;
import java.util.List;

import org.gradle.api.provider.Property;
import org.gradle.api.tasks.Input;
import org.gradle.api.tasks.TaskAction;
import org.gradle.api.tasks.options.Option;

/**
 * {@code gradle csdaPlan} — list requirements that still need a test, code,
 * or a status update. Use {@code --format=json} (or {@code -Pcsda.format=json})
 * for machine output.
 */
public abstract class CsdaPlanTask extends CsdaTask {

    /** Output format: text (human) or json (agents/CI). */
    @Input
    @Option(option = "format", description = "Output format: text or json.")
    public abstract Property<String> getFormat();

    @TaskAction
    public void run() {
        runCli();
    }

    @Override
    protected List<String> cliArgs() {
        List<String> args = new ArrayList<>();
        args.add("plan");
        args.add("--project-dir");
        args.add(".");
        if ("json".equals(getFormat().get())) {
            args.add("--format");
            args.add("json");
        }
        return args;
    }
}
