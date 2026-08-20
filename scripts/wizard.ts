/**
 * Re-export of the interactive project wizard, which lives in
 * `scripts/cli/commands/project/WizardCommand`.
 */
export {
  slugify,
  WIZARD_FIELDS,
  validateAnswer,
  defaultAnswers,
  renderConfigYaml,
  runInitWizard,
  WizardIo,
} from "./cli/commands/project/WizardCommand";
