import { loadAllConcerns } from "../core/concerns.js";

export async function listCommand(): Promise<void> {
  const chalk = (await import("chalk")).default;

  const concerns = loadAllConcerns();

  console.log(chalk.bold("Bundled Concerns\n"));

  const coreConcerns = concerns.filter((c) => c.type === "concern");
  const interactions = concerns.filter((c) => c.type === "interaction");

  if (coreConcerns.length > 0) {
    console.log(chalk.underline("Core Concerns:"));
    for (const c of coreConcerns) {
      console.log(`  ${chalk.green(c.id)} v${c.version}`);
      console.log(`    ${c.name}`);
      console.log(`    Severity: ${c.severity}`);
      console.log(`    Triggers (any_of): ${c.triggerSignals.join(", ")}`);
      console.log("");
    }
  }

  if (interactions.length > 0) {
    console.log(chalk.underline("Interaction Matrices:"));
    for (const c of interactions) {
      console.log(`  ${chalk.green(c.id)} v${c.version}`);
      console.log(`    ${c.name}`);
      console.log(`    Severity: ${c.severity}`);
      console.log(`    Triggers (all_of): ${c.triggerSignals.join(", ")}`);
      console.log("");
    }
  }

  console.log(`Total: ${concerns.length} concerns`);
}
