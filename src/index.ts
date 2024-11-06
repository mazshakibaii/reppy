#!/usr/bin/env node

import { parseAndDocument } from "./lib/parser.js"
import { generateDocs } from "./lib/generateDocs.js"
import {
  parseCliOptions,
  validateGitState,
  commitDocumentationChanges,
} from "./lib/config.js"
import pc from "picocolors"
import cfonts from "cfonts"

/**
 * Main function that initializes the application by displaying a styled message, validates the initial state,
 * parses command line options, and processes the options to generate documentation.
 * If an error occurs during execution, it logs the error message and exits the process.
 * @returns {Promise<void>} A promise that resolves when the main function completes its execution.
 */
async function main() {
  cfonts.say("Reppy", {
    font: "tiny",
    gradient: ["blue", "cyan"],
    transitionGradient: true,
  })

  try {
    const options = parseCliOptions()

    // Check if the git state is valid (only if --unsafe is not set)
    validateGitState(options)

    console.log(
      pc.blue(`Using ${options.provider} with model ${options.model}`)
    )

    await parseAndDocument(options)

    // Only commit if not in --unsafe mode
    if (!options.unsafe) {
      commitDocumentationChanges()
    }
  } catch (error: any) {
    console.error(pc.red(pc.bold(error.message)))
    process.exit(1)
  }
}

main()
