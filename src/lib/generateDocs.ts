import { Function } from "./parser.js"
import { delay, Listr } from "listr2"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import { anthropic } from "@ai-sdk/anthropic"
import { cohere } from "@ai-sdk/cohere"
import { mistral } from "@ai-sdk/mistral"
import { bedrock } from "@ai-sdk/amazon-bedrock"
import fs from "fs/promises"
import dotenv from "dotenv"
import path from "path"
import { CliOptions, DocumentedFunction } from "./types/providers.js"
import { groq } from "@ai-sdk/groq"
import { azure } from "@ai-sdk/azure"
import { confirm } from "@inquirer/prompts"

dotenv.config()

const DOCUMENTATION_FORMATS = {
  ts: {
    format: "JSDoc",
    example: `/**
 * Function description
 * @param {type} paramName - Parameter description
 * @returns {type} Return value description
 */`,
  },
  js: {
    format: "JSDoc",
    example: `/**
 * Function description
 * @param {type} paramName - Parameter description
 * @returns {type} Return value description
 */`,
  },
  java: {
    format: "Javadoc",
    example: `/**
 * Method description
 * @param paramName Parameter description
 * @return Return value description
 */`,
  },
  py: {
    format: "Docstring",
    example: `"""
Function description

Args:
    param_name (type): Parameter description

Returns:
    type: Return value description
"""`,
  },
  rs: {
    format: "Rustdoc",
    example: `/// Function description
/// 
/// # Arguments
/// 
/// * \`param_name\` - Parameter description
/// 
/// # Returns
/// 
/// Return value description`,
  },
  go: {
    format: "GoDoc",
    example: `// FunctionName does something specific
//
// It takes some parameters and returns something else.
//
// Parameters:
//   - param1: description of param1
//   - param2: description of param2
//
// Returns:
//   description of return value`,
  },
} as const

export const documentedFunctions: DocumentedFunction[] = []

/**
 * Retrieves the appropriate AI provider function based on the specified options.
 * @param {CliOptions} options - The configuration options that include the provider type and model.
 * @returns {Function} The AI provider function corresponding to the specified provider.
 */
const getAiProvider = (options: CliOptions) => {
  switch (options.provider) {
    case "openai":
      return openai(options.model!)
    case "anthropic":
      return anthropic(options.model!)
    case "cohere":
      return cohere(options.model!)
    case "mistral":
      return mistral(options.model!)
    case "bedrock":
      return bedrock(options.model!)
    case "groq":
      return groq(options.model!)
    case "azure":
      return azure(options.model!)
    default:
      throw new Error(`Unsupported provider: ${options.provider}`)
  }
}

/**
 * Generates documentation for a list of undocumented functions by utilizing an AI provider to create JSDoc comments based on the function's source code.
 * @param {Function[]} undocumentedFunctions - An array of functions that lack documentation.
 * @param {CliOptions} options - Configuration options for the documentation generation process, including the AI provider and model settings.
 * @returns {Promise<void>} A promise that resolves when the documentation generation process is complete.
 */
export async function generateDocs(
  undocumentedFunctions: Function[],
  options: CliOptions
) {
  let task: Listr<Function>
  let functionsToReturn: DocumentedFunction[] = []

  task = new Listr<Function>(
    undocumentedFunctions
      .sort((a, b) => b.startLine - a.startLine)
      .map((func) => ({
        title: `${func.name}`,
        task: async (): Promise<void> => {
          const fileExt = path.extname(func.filePath).slice(1)
          const langKey = fileExt.replace(
            "tsx",
            "ts"
          ) as keyof typeof DOCUMENTATION_FORMATS
          const docFormat = DOCUMENTATION_FORMATS[langKey]

          const prompt = `You are a documentation generator. Given this ${getLanguageName(
            fileExt
          )} function, write a ${
            docFormat.format
          } comment that describes what it does, its parameters, and return value.

IMPORTANT: 
1. Respond ONLY with the documentation comment
2. Do NOT include any markdown formatting or code blocks
3. Follow this exact format:
${docFormat.example}

Here's the function to document:

${func.sourceCode}`

          try {
            if (options.debug) {
              console.log("Debug: Generating documentation with options:", {
                provider: options.provider,
                model: options.model,
                temperature: options.temperature,
              })
            }

            const { text: docComment } = await generateText({
              model: getAiProvider(options),
              temperature: options.temperature,
              prompt,
            })

            if (!docComment) throw new Error("No documentation generated")

            // Validate the response format
            const cleanedDoc = validateAndCleanResponse(docComment, langKey)

            functionsToReturn.push({
              filePath: func.filePath,
              name: func.name,
              documentation: cleanedDoc,
            })

            // Read the file
            const fileContent = await fs.readFile(func.filePath, "utf-8")
            const lines = fileContent.split("\n")

            // Special handling for Python - insert after the def line
            if (langKey === "py") {
              // Find the first non-empty line in the function body
              let insertLine = func.startLine + 1
              while (
                insertLine <= func.endLine &&
                lines[insertLine].trim() === ""
              ) {
                insertLine++
              }

              // Add proper indentation
              const defLine = lines[func.startLine]
              const indentation = defLine.match(/^\s*/)?.[0] || ""
              const indentedDoc = cleanedDoc
                .split("\n")
                .map((line) => indentation + "    " + line) // Add 4 spaces for Python indentation
                .join("\n")

              // Insert the documentation
              lines.splice(insertLine, 0, indentedDoc)
            } else {
              // For other languages, insert before the function
              lines.splice(func.startLine, 0, cleanedDoc)
            }

            // Write the updated content back to the file
            await fs.writeFile(func.filePath, lines.join("\n"))

            // Update documented flag
            func.isDocumented = true

            // Apply rate limiting if specified
            await delay(options["rate-limit"] ?? 0)
          } catch (error: any) {
            throw new Error(
              `Failed to generate docs for ${func.name}: ${error.message}`
            )
          }
        },
      })),
    {
      concurrent: options.concurrent ?? false,
      rendererOptions: {
        collapseSubtasks: options.output === "minimal",
        collapseErrors: options.output === "minimal",
      },
    }
  )

  try {
    await task.run()
  } catch (e: any) {
    console.error(e)
  }

  return functionsToReturn
}

/**
 * Returns the name of the programming language associated with a given file extension.
 * @param {string} ext - The file extension for which to retrieve the language name.
 * @returns {string} The name of the programming language, or the original extension if not recognized.
 */
function getLanguageName(ext: string): string {
  const langMap: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript",
    js: "JavaScript",
    jsx: "JavaScript",
    py: "Python",
    rs: "Rust",
    java: "Java",
    go: "Go",
  }
  return langMap[ext] || ext
}

/**
 * Validates and cleans a documentation response string based on the specified language format.
 * The function removes any markdown code block indicators and checks if the cleaned response
 * adheres to the expected documentation format for the given language key.
 * @param {string} response - The documentation response string to be validated and cleaned.
 * @param {keyof typeof DOCUMENTATION_FORMATS} langKey - The key representing the language format
 * for validation (e.g., 'ts' for TypeScript, 'java' for Java, etc.).
 * @returns {string} The cleaned and validated documentation response string.
 */
function validateAndCleanResponse(
  response: string,
  langKey: keyof typeof DOCUMENTATION_FORMATS
): string {
  // Remove any markdown code block indicators
  let cleaned = response.replace(/```[\w-]*\n?|\n```/g, "").trim()

  // Validate based on language
  switch (langKey) {
    case "ts":
    case "js":
      if (!cleaned.startsWith("/**") || !cleaned.endsWith("*/")) {
        throw new Error("Invalid JSDoc format")
      }
      break
    case "java":
      if (!cleaned.startsWith("/**") || !cleaned.endsWith("*/")) {
        throw new Error("Invalid Javadoc format")
      }
      break
    case "py":
      if (!cleaned.startsWith('"""') || !cleaned.endsWith('"""')) {
        throw new Error("Invalid Python docstring format")
      }
      break
    case "rs":
      if (!cleaned.startsWith("///")) {
        throw new Error("Invalid Rustdoc format")
      }
      break
    case "go":
      if (!cleaned.startsWith("//")) {
        throw new Error("Invalid GoDoc format")
      }
      // Ensure each line starts with //
      cleaned = cleaned
        .split("\n")
        .map((line) => (line.trim().startsWith("//") ? line : `// ${line}`))
        .join("\n")
      break
  }

  return cleaned
}

interface ReadmeContext {
  fileGroups: Record<string, DocumentedFunction[]>
  fileSummaries: Array<{
    filePath: string
    summary: string
    functions: DocumentedFunction[]
  }>
  readmeContent: string
}

/**
 * Generates a comprehensive README file documenting the codebase functionality
 * @param {Function[]} functions - Array of all documented functions
 * @param {CliOptions} options - Configuration options
 * @returns {Promise<void>}
 */
export async function generateReadme(
  functions: DocumentedFunction[],
  options: CliOptions
) {
  const task = new Listr<ReadmeContext>(
    [
      {
        title: "Analyzing codebase structure",
        task: (ctx) => {
          ctx.fileGroups = functions.reduce((acc, func) => {
            if (!acc[func.filePath]) {
              acc[func.filePath] = []
            }
            acc[func.filePath].push(func)
            return acc
          }, {} as Record<string, DocumentedFunction[]>)
          ctx.fileSummaries = []
        },
      },
      {
        title: "Generating file summaries",
        task: (ctx, task): Listr =>
          task.newListr(
            Object.entries(ctx.fileGroups).map(([filePath, fileFunctions]) => ({
              title: `Summarizing ${filePath}`,
              task: async () => {
                const filePrompt = `You are a technical documentation expert. Given these documented functions from the file ${filePath}, provide a brief summary of what this file's purpose is and how its functions work together.

Functions in this file:
${fileFunctions
  .map(
    (f: DocumentedFunction) => `
Function Name: ${f.name}
Documentation: ${f.documentation}
`
  )
  .join("\n\n")}`

                const { text: fileSummary } = await generateText({
                  model: getAiProvider(options),
                  temperature: 0.3,
                  prompt: filePrompt,
                })

                ctx.fileSummaries.push({
                  filePath,
                  summary: fileSummary,
                  functions: fileFunctions,
                })
              },
            })),
            {
              concurrent: 5,
              rendererOptions: {
                collapseSubtasks: true,
              },
            }
          ),
      },
      {
        title: "Generating README content",
        task: async (ctx) => {
          const readmePrompt = `You are a technical documentation expert. Based on these file summaries, generate a comprehensive README.md file that explains the codebase from a functional perspective. Focus on explaining how the different parts work together and what the codebase does.

Include these sections:
1. Overview
2. File Structure
3. Key Features
4. Architecture

Here are the file summaries and their functions:

${ctx.fileSummaries
  .map(
    (file) => `
## ${file.filePath}
${file.summary}
`
  )
  .join("\n")}`

          const { text: readmeContent } = await generateText({
            model: getAiProvider(options),
            temperature: 0.3,
            prompt: readmePrompt,
          })

          ctx.readmeContent = readmeContent
        },
      },
      {
        title: "Writing README file",
        task: async (ctx) => {
          await fs.writeFile("REPPY-README.md", ctx.readmeContent, "utf-8")
        },
      },
    ],
    {
      rendererOptions: {
        collapseSubtasks: options.output === "minimal",
        collapseErrors: options.output === "minimal",
      },
    }
  )

  try {
    console.log("\n")
    await task.run({} as ReadmeContext)

    if (options.debug) {
      console.log("Debug: Generated REPPY-README.md successfully")
      if (task.errors.length > 0) {
        console.log("Debug: Encountered errors:", task.errors)
      }
    }
  } catch (error: any) {
    console.error("Failed to generate README:", error.message)
  }
}
