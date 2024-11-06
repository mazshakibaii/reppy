import commandLineArgs, { OptionDefinition } from "command-line-args"
import commandLineUsage from "command-line-usage"
import { CliOptions, SupportedProvider } from "./types/providers.js"
import pc from "picocolors"
import { execSync } from "child_process"
import { Listr } from "listr2"
import { glob } from "glob"
import path from "path"
import { minimatch } from "minimatch"

// Extend OptionDefinition to include description
interface CommandOption extends OptionDefinition {
  description: string
}

const SUPPORTED_PROVIDERS = [
  "openai",
  "anthropic",
  "cohere",
  "mistral",
  "azure",
  "groq",
  "bedrock",
] as const

const optionDefinitions: CommandOption[] = [
  {
    name: "help",
    alias: "h",
    type: Boolean,
    description: "Display this help message",
  },
  {
    name: "provider",
    alias: "p",
    type: String,
    defaultValue: "openai",
    description:
      "AI provider to use (openai, anthropic, cohere, mistral, azure, groq, bedrock)",
  },
  {
    name: "model",
    alias: "m",
    type: String,
    description: "Model to use for generation",
  },
  {
    name: "temperature",
    alias: "t",
    type: Number,
    defaultValue: 0.1,
    description: "Temperature for generation (0-1)",
  },
  {
    name: "files",
    alias: "f",
    type: String,
    multiple: true,
    description: "Files or globs to process",
  },
  {
    name: "ignore",
    alias: "i",
    type: String,
    multiple: true,
    description: "Files or globs to ignore",
  },
  {
    name: "debug",
    alias: "d",
    type: Boolean,
    defaultValue: false,
    description: "Enable debug logging",
  },
  {
    name: "concurrent",
    alias: "c",
    type: Number,
    defaultValue: 1,
    description: "Number of functions to process concurrently (default: 1)",
  },
  {
    name: "rate-limit",
    type: Number,
    defaultValue: 1000,
    description: "Rate limit between API calls in ms",
  },
  {
    name: "output",
    alias: "o",
    type: String,
    defaultValue: "normal",
    description: "Output verbosity (minimal, normal, verbose)",
  },
  {
    name: "unsafe",
    type: Boolean,
    defaultValue: false,
    description: "Skip Git repository checks",
  },
]

const helpSections = [
  {
    header: pc.cyan("Reppy"),
    content: "Automatically generate documentation for your codebase using AI.",
  },
  {
    header: "Usage",
    content: [
      "$ reppy [options]",
      "",
      "Example:",
      '$ reppy -p anthropic -m "claude-3-sonnet" -t 0.2',
    ],
  },
  {
    header: "Options",
    optionList: optionDefinitions,
  },
  {
    header: "Environment Variables",
    content: [
      { name: "OPENAI_API_KEY", summary: "Required for OpenAI provider" },
      { name: "ANTHROPIC_API_KEY", summary: "Required for Anthropic provider" },
      { name: "AZURE_API_KEY", summary: "Required for Azure provider" },
      { name: "AZURE_ENDPOINT", summary: "Required for Azure provider" },
      { name: "MISTRAL_API_KEY", summary: "Required for Mistral provider" },
      { name: "COHERE_API_KEY", summary: "Required for Cohere provider" },
      { name: "GROQ_API_KEY", summary: "Required for Groq provider" },
      {
        name: "AWS_ACCESS_KEY_ID",
        summary: "Required for Amazon Bedrock provider",
      },
      {
        name: "AWS_SECRET_ACCESS_KEY",
        summary: "Required for Amazon Bedrock provider",
      },
      { name: "AWS_REGION", summary: "Required for Amazon Bedrock provider" },
    ],
  },
  {
    header: "Examples",
    content: [
      {
        desc: "1. Use OpenAI with GPT-4",
        example: "$ reppy -p openai -m gpt-4",
      },
      {
        desc: "2. Use Anthropic with custom temperature",
        example: "$ reppy -p anthropic -t 0.2",
      },
      {
        desc: "3. Process specific files",
        example: '$ reppy -f "src/**/*.ts"',
      },
      {
        desc: "4. Ignore test files",
        example: '$ reppy -i "**/*.test.ts" "**/*.spec.ts"',
      },
      {
        desc: "5. Process 4 functions concurrently",
        example: "$ reppy --concurrent 4",
      },
      {
        desc: "6. Debug mode with minimal output",
        example: "$ reppy --debug --output minimal",
      },
    ],
  },
]

const defaultModels = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3.5-sonnet",
  cohere: "command",
  mistral: "mistral-tiny",
  bedrock: "claude-3.5-sonnet",
  groq: "mixtral-8x7b-32768",
  azure: "gpt-4o-mini",
} as const

const ENV_REQUIREMENTS = {
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  azure: ["AZURE_API_KEY", "AZURE_RESOURCE_NAME"],
  mistral: ["MISTRAL_API_KEY"],
  cohere: ["COHERE_API_KEY"],
  groq: ["GROQ_API_KEY"],
  bedrock: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
} as const

/**
 * Validates the presence of required environment variables for a given provider.
 * @param {SupportedProvider} provider - The provider for which to validate environment variables.
 * @throws {Error} Throws an error if any required environment variables are missing or empty.
 */
function validateEnvironmentVariables(provider: SupportedProvider) {
  const requiredVars = ENV_REQUIREMENTS[provider]
  const missingVars = requiredVars.filter(
    (envVar) => !process.env[envVar] || process.env[envVar]?.trim() === ""
  )

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables for ${provider}: ${missingVars.join(
        ", "
      )}\nPlease set these in your .env file.`
    )
  }
}

/**
 * Processes file patterns and returns matched files
 */
function processFilePatterns(
  includePatterns: string[] = [],
  ignorePatterns: string[] = []
): string[] {
  // If no include patterns specified, use default
  const patterns = includePatterns.length > 0 ? includePatterns : ["**/*"]

  // Build ignore patterns - always ignore node_modules and git
  const defaultIgnores = ["**/node_modules/**", "**/.git/**"]
  const allIgnorePatterns = [...defaultIgnores, ...ignorePatterns]

  // First, get all matching files without ignore patterns
  const allFiles = patterns.flatMap((pattern) => {
    pattern = pattern.replace(/^\.\//, "").replace(/\\/g, "/")
    return glob.sync(pattern, {
      nodir: true,
      absolute: true,
      dot: true,
    })
  })

  // Convert all paths to relative for consistent matching
  const relativeFiles = allFiles.map((file) =>
    path.relative(process.cwd(), file).replace(/\\/g, "/")
  )

  // Filter out ignored files
  const filteredFiles = relativeFiles.filter((file) => {
    for (const ignorePattern of allIgnorePatterns) {
      // Normalize the ignore pattern
      const normalizedPattern = ignorePattern
        .replace(/^\.\//, "")
        .replace(/\\/g, "/")

      // For exact file matches (no glob patterns)
      if (!normalizedPattern.includes("*")) {
        if (
          file === normalizedPattern ||
          file === `./${normalizedPattern}` ||
          file.endsWith(`/${normalizedPattern}`) ||
          file === ignorePattern
        ) {
          if (process.env.DEBUG === "true") {
            console.debug(
              `File ${file} matched ignore pattern ${ignorePattern}`
            )
          }
          return false
        }
      }
      // For glob patterns
      else if (minimatch(file, normalizedPattern)) {
        if (process.env.DEBUG === "true") {
          console.debug(`File ${file} matched ignore pattern ${ignorePattern}`)
        }
        return false
      }
    }
    return true
  })

  if (process.env.DEBUG === "true") {
    console.debug("Working directory:", process.cwd())
    console.debug("Include patterns:", patterns)
    console.debug("Ignore patterns:", allIgnorePatterns)
    console.debug("All matched files:", relativeFiles)
    console.debug("After ignore filtering:", filteredFiles)
  }

  return [...new Set(filteredFiles)] // Remove duplicates
}

/**
 * Validates the initial state of a Git repository by checking if it exists and if there are any uncommitted changes.
 * Throws an error if the repository does not exist or if there are uncommitted changes.
 * @returns {void} This function does not return a value; it either completes successfully or throws an error.
 */
export function validateGitState(options: CliOptions) {
  if (options.unsafe) {
    return // Skip Git checks if unsafe flag is set
  }

  try {
    // Check if git repo exists
    execSync("git rev-parse --is-inside-work-tree", { stdio: "ignore" })

    // Check for uncommitted changes
    const status = execSync("git status --porcelain").toString()

    if (status.length > 0) {
      throw new Error(
        "There are uncommitted changes in your repository. " +
          "Please commit or stash your changes before running reppy."
      )
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("uncommitted changes")) {
        throw error
      } else {
        throw new Error(
          "Not a git repository. Please initialize a git repository and commit your changes before running reppy."
        )
      }
    }
  }
}

/**
 * Parses command line options for the CLI application, validating and setting defaults as necessary.
 * @returns {CliOptions} An object containing the parsed command line options, including validated properties such as provider, model, temperature, output, and rate limit.
 */
export function parseCliOptions(): CliOptions {
  const options = commandLineArgs(optionDefinitions)

  // Show help menu if requested
  if (options.help) {
    console.log(commandLineUsage(helpSections))
    process.exit(0)
  }

  // Validate provider
  if (options.provider && !SUPPORTED_PROVIDERS.includes(options.provider)) {
    throw new Error(
      `Invalid provider: ${
        options.provider
      }. Supported providers are: ${SUPPORTED_PROVIDERS.join(", ")}`
    )
  }

  // Set up debug logging first so we can see file processing output if needed
  if (options.debug) {
    process.env.DEBUG = "true"
    console.debug = (...args) => {
      if (process.env.DEBUG === "true") {
        console.log(pc.gray("[debug]"), ...args)
      }
    }
  }

  // Move file processing to happen after all other option validations
  let processedFiles: string[] = []
  if (!options.files && !options.ignore) {
    // If no files or ignore patterns specified, process everything
    processedFiles = processFilePatterns()
  } else {
    // Process with specified patterns
    processedFiles = processFilePatterns(options.files, options.ignore)
    if (processedFiles.length === 0) {
      throw new Error("No files matched the specified patterns")
    }
  }
  options.files = processedFiles

  const validOutputLevels = ["minimal", "normal", "verbose"]
  if (options.output && !validOutputLevels.includes(options.output)) {
    throw new Error(
      `Invalid output level: ${
        options.output
      }. Must be one of: ${validOutputLevels.join(", ")}`
    )
  }

  // Validate environment variables for the selected provider
  validateEnvironmentVariables(options.provider as SupportedProvider)

  // Set default model based on provider if not specified
  if (!options.model) {
    options.model =
      defaultModels[options.provider as keyof typeof defaultModels]
  }

  // Validate temperature
  if (
    options.temperature !== undefined &&
    (options.temperature < 0 || options.temperature > 1)
  ) {
    throw new Error("Temperature must be between 0 and 1")
  }

  // Validate rate limit
  if (options["rate-limit"] !== undefined && options["rate-limit"] < 0) {
    throw new Error("Rate limit must be a positive number")
  }

  return options as CliOptions
}

/**
 * Commits any changes made to documentation files in a Git repository.
 * It checks for modified files, stages them based on specific extensions,
 * and creates a commit with a predefined message if there are changes to commit.
 * @returns {Promise<void>} A promise that resolves when the commit process is complete.
 */
export async function commitDocumentationChanges() {
  const task = new Listr([
    {
      title: "Committing documentation changes",
      task: async (_, task) => {
        return new Promise((resolve, reject) => {
          try {
            // Check if there are any changes to commit
            const status = execSync("git status --porcelain").toString()

            if (status.length === 0) {
              task.title = "No documentation changes to commit"
              return resolve("No documentation changes to commit")
            }

            execSync("git add .", { stdio: "ignore" })

            // Check if any files were staged
            const stagedStatus = execSync(
              "git diff --cached --name-only"
            ).toString()

            if (stagedStatus.length === 0) {
              task.title = "No documentation files were modified"
              return resolve("No documentation files were modified")
            }

            // Create commit with documentation message
            execSync('git commit -m "docs: documented with reppy"', {
              stdio: "ignore",
            })

            task.title = "Documentation changes committed to Git"
            resolve("Documentation changes committed to Git")
          } catch (error) {
            if (error instanceof Error) {
              task.title = "Failed to commit documentation changes"
              reject(
                `Failed to commit documentation changes - ${error.message}`
              )
            } else {
              task.title = "Failed to commit documentation changes"
              reject("Failed to commit documentation changes")
            }
          }
        })
      },
    },
  ])

  await task.run()
}

/**
 * Logs a message to the console based on the specified level and options.
 * @param {string} message - The message to log.
 * @param {"minimal" | "normal" | "verbose"} level - The level of the message.
 * @param {CliOptions} options - The options object containing the output level.
 */
export function log(
  message: string,
  level: "minimal" | "normal" | "verbose",
  options: CliOptions
) {
  const outputLevel = options.output || "normal"
  const outputLevels = {
    minimal: ["minimal"],
    normal: ["minimal", "normal"],
    verbose: ["minimal", "normal", "verbose"],
  }

  if (outputLevels[outputLevel].includes(level)) {
    console.log(message)
  }
}
