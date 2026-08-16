package com.rsaglobaltech.csda.gradle;

import java.util.Arrays;
import java.util.List;

import org.gradle.api.tasks.TaskAction;

/**
 * {@code gradle csdaDoctor} — full project/environment diagnosis; every
 * finding is reported with a concrete fix.
 */
public abstract class CsdaDoctorTask extends CsdaTask {

    @TaskAction
    public void run() {
        runCli();
    }

    @Override
    protected List<String> cliArgs() {
        return Arrays.asList("doctor", "--project-dir", ".");
    }
}
