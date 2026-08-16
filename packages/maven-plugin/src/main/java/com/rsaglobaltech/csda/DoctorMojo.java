package com.rsaglobaltech.csda;

import java.util.Arrays;
import java.util.List;

import org.apache.maven.plugins.annotations.Mojo;

/**
 * {@code mvn csda:doctor} — full project/environment diagnosis; every
 * finding is reported with a concrete fix.
 */
@Mojo(name = "doctor", threadSafe = true)
public class DoctorMojo extends AbstractCsdaMojo {

    @Override
    protected List<String> cliArgs() {
        return Arrays.asList("doctor", "--project-dir", ".");
    }
}
