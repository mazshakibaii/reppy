import Parser from "tree-sitter"
import JavaScript from "tree-sitter-javascript"
import TypeScript from "tree-sitter-typescript"
import Python from "tree-sitter-python"
import Rust from "tree-sitter-rust"
import Java from "tree-sitter-java"
import Go from "tree-sitter-go"
import fs from "fs"
import path from "path"
import { glob } from "glob"
import logSymbols from "log-symbols"
import pc from "picocolors"
import {
  documentedFunctions,
  generateDocs,
  generateReadme,
} from "./generateDocs.js"
import { parseCliOptions } from "./config.js"
import { ESLint } from "eslint"
import { CliOptions, DocumentedFunction } from "./types/providers.js"
import { confirm } from "@inquirer/prompts"

const SUPPORTED_LANGUAGES = {
  js: { parser: JavaScript, extensions: [".js", ".jsx"] as const },
  ts: { parser: TypeScript.typescript, extensions: [".ts", ".tsx"] as const },
  python: { parser: Python, extensions: [".py"] as const },
  rust: { parser: Rust, extensions: [".rs"] as const },
  java: { parser: Java, extensions: [".java"] as const },
  go: { parser: Go, extensions: [".go"] as const },
} as const

type LanguageKey = keyof typeof SUPPORTED_LANGUAGES

export interface Function {
  name: string
  node: Parser.SyntaxNode
  filePath: string
  startLine: number
  endLine: number
  sourceCode: string
  isDocumented: boolean
  cleanedDoc?: string
}

/**
 * Parses source files to identify undocumented functions and generates documentation for them.
 * @param {CliOptions} options - Configuration options for documentation generation.
 * @returns {Promise<void>} A promise that resolves when the documentation generation is complete.
 */
export async function parseAndDocument(options: CliOptions) {
  const parser = new Parser()
  // Use the files from options if provided, otherwise use default pattern
  const patterns = options.files || ["**/*.{ts,tsx,js,jsx,py,rs,java,go}"]
  // Use ignore patterns from options
  const ignorePatterns = options.ignore || []

  try {
    for await (const file of findFiles(patterns, ignorePatterns)) {
      const language = getLanguageForFile(file)
      if (!language) continue

      let undocumentedFunctions: Function[] = []

      const functions = await processFile(file, parser, language)

      for await (const func of functions) {
        if (func.isDocumented) {
          console.log(logSymbols.success, func.name)
        } else {
          // Mark functions as documented after generation
          undocumentedFunctions.push(func)
        }
      }
      const returnedFunctions = await generateDocs(
        undocumentedFunctions,
        options
      )

      documentedFunctions.push(...returnedFunctions)
    }
  } catch (error) {
    console.error(pc.red(`Parser error: ${(error as Error).message}`))
  }
  const answer = await confirm({
    message: "Generate a REPPY-README.md file to document the codebase?",
  })
  if (answer) {
    await generateReadme(documentedFunctions, options)
  }
}

/**
 * Asynchronously finds files matching the specified patterns while ignoring certain directories and files.
 * It also reads patterns from a .gitignore file if it exists to further filter the results.
 * @param {string[]} patterns - An array of glob patterns to match files against.
 * @param {string[]} ignorePatterns - An array of additional glob patterns to ignore when searching for files.
 * @returns {AsyncGenerator<string>} An asynchronous generator that yields the paths of the matching files.
 */
async function* findFiles(patterns: string[], ignorePatterns: string[]) {
  // Read .gitignore if it exists
  let gitignorePatterns: string[] = []
  try {
    const gitignoreContent = fs.readFileSync(".gitignore", "utf-8")
    gitignorePatterns = gitignoreContent
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
  } catch (error) {
    // .gitignore doesn't exist, continue without it
  }

  // Combine all ignore patterns
  const allIgnorePatterns = [
    "node_modules/**",
    "dist/**",
    "build/**",
    ".git/**",
    "**/*.d.ts",
    "**/vendor/**",
    "**/target/**",
    "**/__pycache__/**",
    "public/**",
    ".*/**",
    ...gitignorePatterns,
    ...ignorePatterns
      .map((pattern) => {
        // Ensure patterns work with both direct file names and glob patterns
        if (!pattern.includes("*")) {
          return [pattern, `**/${pattern}`, `./${pattern}`]
        }
        return pattern
      })
      .flat(),
  ]

  if (process.env.DEBUG === "true") {
    console.debug("Patterns to match:", patterns)
    console.debug("Ignore patterns:", allIgnorePatterns)
  }

  const files = await glob(patterns, {
    ignore: allIgnorePatterns,
    nodir: true,
    absolute: true,
  })

  for (const file of files) {
    yield file
  }
}

/**
 * Retrieves the programming language associated with a given file based on its file extension.
 * @param {string} filePath - The path of the file for which to determine the programming language.
 * @returns {LanguageKey | undefined} The language key corresponding to the file's extension, or undefined if no matching language is found.
 */
function getLanguageForFile(filePath: string): LanguageKey | undefined {
  const ext = path.extname(filePath)
  return Object.entries(SUPPORTED_LANGUAGES).find(([_, config]) =>
    (config.extensions as unknown as string[]).includes(ext)
  )?.[0] as LanguageKey | undefined
}

/**
 * Processes a JavaScript file to extract and return an array of functions defined within it, while also performing linting checks using ESLint.
 * @param {string} filePath - The path to the JavaScript file to be processed.
 * @returns {Promise<Function[]>} A promise that resolves to an array of functions extracted from the file, or an empty array if an error occurs.
 */
async function processJavaScriptFile(filePath: string): Promise<Function[]> {
  const functions: Function[] = []

  const eslint = new ESLint({
    cwd: process.cwd(),
    overrideConfigFile: true, // Enable flat config
    overrideConfig: [
      {
        files: ["**/*.{js,jsx,ts,tsx}"],
        languageOptions: {
          parser: (await import("@typescript-eslint/parser")).default,
          ecmaVersion: 2022,
          sourceType: "module",
          parserOptions: {
            project: null, // Disable TypeScript project resolution
          },
        },
      },
    ],
  })

  try {
    const sourceCode = fs.readFileSync(filePath, "utf-8")
    const results = await eslint.lintText(sourceCode, { filePath })
    const relativePath = path.relative(process.cwd(), filePath)
    console.log(`\nScanning ${pc.blue(relativePath)}:`)

    if (results[0]?.messages) {
      const ast = await parseJavaScriptAST(sourceCode, filePath)
      processJavaScriptAST(
        ast,
        sourceCode,
        filePath,
        results[0].messages,
        functions
      )
    }

    return functions
  } catch (error) {
    const relativePath = path.relative(process.cwd(), filePath)
    console.error(
      pc.red(`Error processing ${relativePath}: ${(error as Error).message}`)
    )
    return []
  }
}

/**
 * Processes a file to extract functions based on the specified programming language.
 * If the language is JavaScript or TypeScript, it uses a specific processing method; otherwise, it utilizes tree-sitter logic for other languages.
 * @param {string} filePath - The path to the file to be processed.
 * @param {Parser} parser - The parser instance used to parse the source code of the file.
 * @param {LanguageKey} language - The programming language key that determines the parsing strategy.
 * @returns {Promise<Function[]>} A promise that resolves to an array of extracted functions from the file.
 */
async function processFile(
  filePath: string,
  parser: Parser,
  language: LanguageKey
): Promise<Function[]> {
  // Handle JavaScript/TypeScript files with ESLint
  if (language === "js" || language === "ts") {
    return processJavaScriptFile(filePath)
  }

  // Existing tree-sitter logic for other languages
  const functions: Function[] = []
  const langConfig = SUPPORTED_LANGUAGES[language]

  try {
    const sourceCode = fs.readFileSync(filePath, "utf-8")
    parser.setLanguage(langConfig.parser)
    const tree = parser.parse(sourceCode)
    const queryString = getFunctionQuery(language)
    const query = new Parser.Query(langConfig.parser, queryString)
    const matches = query.matches(tree.rootNode)

    if (matches.length > 0) {
      const relativePath = path.relative(process.cwd(), filePath)
      console.log(`\nScanning ${pc.blue(relativePath)}:`)
      processMatchesAndCollect(matches, filePath, sourceCode, functions)
    }

    return functions
  } catch (error) {
    const relativePath = path.relative(process.cwd(), filePath)
    console.error(
      pc.red(`Error processing ${relativePath}: ${(error as Error).message}`)
    )
    return []
  }
}

/**
 * Generates a query string for extracting function-related information based on the specified programming language.
 * @param {LanguageKey} language - The programming language for which to generate the function query.
 * @returns {string} A query string that defines patterns for matching functions, methods, and their documentation in the specified language.
 */
function getFunctionQuery(language: LanguageKey): string {
  switch (language) {
    case "js":
    case "ts":
      return `
        [
          ; Functions with documentation
          (
            [(comment) (comment)*] @doc  ; Allow for multiple comments
            [
              ; Regular functions
              (function_declaration
                name: (identifier) @function_name
              )
              ; Exported functions
              (export_statement
                declaration: (function_declaration
                  name: (identifier) @function_name
                )
              )
              ; Arrow functions
              (variable_declarator
                name: (identifier) @function_name
                value: (arrow_function)
              )
              (export_statement
                declaration: (variable_declaration
                  (variable_declarator
                    name: (identifier) @function_name
                    value: (arrow_function)
                  )
                )
              )
            ] @function
          )

          ; Functions without documentation
          [
            ; Regular functions
            (function_declaration
              name: (identifier) @function_name
            )
            ; Exported functions
            (export_statement
              declaration: (function_declaration
                name: (identifier) @function_name
              )
            )
            ; Arrow functions
            (variable_declarator
              name: (identifier) @function_name
              value: (arrow_function)
            )
            (export_statement
              declaration: (variable_declaration
                (variable_declarator
                  name: (identifier) @function_name
                  value: (arrow_function)
                )
              )
            )
          ] @function
        ]
      `

    case "java":
      return `
        [
          ; Methods with documentation
          (
            (block_comment) @doc
            (method_declaration
              name: (identifier) @function_name
            ) @function
          )

          ; Constructors with documentation
          (
            (block_comment) @doc
            (constructor_declaration
              name: (identifier) @function_name
            ) @function
          )

          ; Methods without documentation
          (
            method_declaration
            name: (identifier) @function_name
          ) @function

          ; Constructors without documentation
          (
            constructor_declaration
            name: (identifier) @function_name
          ) @function
        ]
      `
    case "python":
      return `
        [
          ; Functions with documentation
          (function_definition
            name: (identifier) @function_name
            body: (block
              (expression_statement
                (string) @doc)  ; Docstring as first statement
            )
          ) @function

          ; Class methods with documentation
          (class_definition
            body: (block
              (function_definition
                name: (identifier) @function_name
                body: (block
                  (expression_statement
                    (string) @doc)  ; Docstring as first statement
                )
              ) @function
            )
          )

          ; Functions without documentation
          (function_definition
            name: (identifier) @function_name
          ) @function

          ; Class methods without documentation
          (class_definition
            body: (block
              (function_definition
                name: (identifier) @function_name
              ) @function
            )
          )
        ]
      `
    case "rust":
      return `
        [
          ; Functions with documentation
          (
            (line_comment) @doc
            (function_item
              name: (identifier) @function_name
            ) @function
          )

          ; Functions without documentation
          (function_item
            name: (identifier) @function_name
          ) @function
        ]
      `
    case "go":
      return `
        [
          ; Functions with documentation
          (
            (comment)+ @doc  ; One or more comments
            [
              ; Regular functions
              (function_declaration
                name: (identifier) @function_name
              ) @function

              ; Methods
              (method_declaration
                name: (field_identifier) @function_name
              ) @function
            ]
          )

          ; Functions without documentation
          [
            ; Regular functions without docs
            (function_declaration
              name: (identifier) @function_name
            ) @function

            ; Methods without docs
            (method_declaration
              name: (field_identifier) @function_name
            ) @function
          ]
        ]
      `
  }
}

/**
 * Processes an array of query matches to collect function information and documentation status.
 * @param {Parser.QueryMatch[]} matches - An array of query matches containing captured nodes for functions and documentation.
 * @param {string} filePath - The path of the file being processed.
 * @param {string} sourceCode - The source code of the file as a string.
 * @param {Function[]} functions - An array to which processed function information will be added.
 * @returns {void} This function does not return a value; it modifies the functions array in place.
 */
function processMatchesAndCollect(
  matches: Parser.QueryMatch[],
  filePath: string,
  sourceCode: string,
  functions: Function[]
) {
  const processedFunctions = new Set<string>()

  matches.forEach((match) => {
    const functionNode = match.captures.find(
      (capture) => capture.name === "function"
    )
    const docNodes = match.captures.filter((capture) => capture.name === "doc")
    const functionName = match.captures.find(
      (capture) => capture.name === "function_name"
    )

    if (functionNode && functionName) {
      const funcKey = `${functionName.node.text}-${functionNode.node.startPosition.row}`

      if (processedFunctions.has(funcKey)) return
      processedFunctions.add(funcKey)

      const language = getLanguageForFile(filePath)

      let isDocumented = false
      let cleanedDoc: string | undefined

      // Check each doc node and keep the first valid documentation
      for (const doc of docNodes) {
        const validation = isValidDocumentation(doc.node.text, language)
        if (validation.isValid) {
          isDocumented = true
          cleanedDoc = validation.doc

          documentedFunctions.push({
            name: functionName.node.text,
            documentation: cleanedDoc!,
            filePath,
          })
          break
        }
      }

      functions.push({
        name: functionName.node.text,
        node: functionNode.node,
        filePath,
        startLine: functionNode.node.startPosition.row,
        endLine: functionNode.node.endPosition.row,
        sourceCode: sourceCode
          .split("\n")
          .slice(
            functionNode.node.startPosition.row,
            functionNode.node.endPosition.row + 1
          )
          .join("\n"),
        isDocumented,
        cleanedDoc,
      })
    }
  })
}

interface DocumentationValidation {
  isValid: boolean
  doc?: string
}

/**
 * Checks if the given comment text is a valid documentation comment for the specified language.
 * @param {string} commentText - The text content of the comment.
 * @param {LanguageKey | undefined} language - The programming language to check documentation format for.
 * @returns {DocumentationValidation} An object containing the validation status and the documentation content.
 */
function isValidDocumentation(
  commentText: string,
  language: LanguageKey | undefined
): DocumentationValidation {
  if (!language || !commentText) return { isValid: false }

  const trimmedComment = commentText.trim()

  switch (language) {
    case "js":
    case "ts":
      // Check for both JSDoc style and regular block comments
      if (
        (trimmedComment.startsWith("/**") && trimmedComment.endsWith("*/")) ||
        (trimmedComment.startsWith("/*") && trimmedComment.endsWith("*/"))
      ) {
        return {
          isValid: true,
          doc: trimmedComment,
        }
      }
      break

    case "python":
      if (commentText.includes('"""') || trimmedComment.startsWith("#")) {
        return {
          isValid: true,
          doc: trimmedComment,
        }
      }
      break

    case "rust":
      if (
        commentText.includes("///") ||
        commentText.includes("//!") ||
        (commentText.includes("/*") && commentText.includes("*/"))
      ) {
        return {
          isValid: true,
          doc: trimmedComment,
        }
      }
      break

    case "java":
      if (
        trimmedComment.startsWith("/**") ||
        trimmedComment.startsWith("/*") ||
        trimmedComment.startsWith("//")
      ) {
        return {
          isValid: true,
          doc: trimmedComment,
        }
      }
      break

    case "go":
      if (
        trimmedComment.startsWith("//") &&
        !trimmedComment.includes("TODO") &&
        trimmedComment.length > 2 &&
        trimmedComment.substring(2).trim().length > 0
      ) {
        return {
          isValid: true,
          doc: trimmedComment,
        }
      }
      break
  }

  return { isValid: false }
}

/**
 * Parses the provided JavaScript source code into an Abstract Syntax Tree (AST) using the TypeScript ESLint parser.
 * @param {string} sourceCode - The JavaScript source code to be parsed.
 * @param {string} filePath - The path of the file from which the source code was read, used for error reporting and location tracking.
 * @returns {Promise<Object>} A promise that resolves to the parsed AST object.
 */
async function parseJavaScriptAST(sourceCode: string, filePath: string) {
  const tsParser = await import("@typescript-eslint/parser")
  return tsParser.parse(sourceCode, {
    sourceType: "module",
    ecmaVersion: 2022,
    loc: true,
    filePath,
  })
}

/**
 * Processes a JavaScript abstract syntax tree (AST) to identify and collect information about named functions and methods.
 * @param {any} ast - The abstract syntax tree representing the JavaScript code to be analyzed.
 * @param {string} sourceCode - The original source code as a string, used for extracting function definitions.
 * @param {string} filePath - The file path of the source code, used for reference in the collected information.
 * @param {any[]} lintMessages - An array to collect linting messages related to the identified functions.
 * @param {Function[]} functions - An array that will be populated with information about the identified functions and methods.
 * @returns {void} This function does not return a value; it modifies the functions array with details of the identified functions.
 */
function processJavaScriptAST(
  ast: any,
  sourceCode: string,
  filePath: string,
  lintMessages: any[],
  functions: Function[]
) {
  /**
   * Traverses an abstract syntax tree (AST) node to identify and collect information about named functions and methods.
   * @param {any} node - The AST node to traverse, which may represent a function declaration, method, function expression, or variable declaration containing a function.
   * @returns {void} This function does not return a value; it populates a global array with information about the identified functions.
   */
  function traverse(node: any) {
    if (!node) return

    // Only process named functions and methods
    if (
      (node.type === "FunctionDeclaration" && node.id?.name) || // Named function declarations
      (node.type === "MethodDefinition" && node.key?.name) || // Class methods
      (node.type === "FunctionExpression" && node.id?.name) || // Named function expressions
      (node.type === "VariableDeclarator" &&
        node.id?.name &&
        (node.init?.type === "ArrowFunctionExpression" ||
          node.init?.type === "FunctionExpression")) // Named variable functions
    ) {
      const functionName =
        node.id?.name || node.key?.name || (node.init ? node.id?.name : null)

      // Skip if no name was found
      if (!functionName) return

      const startLine = node.loc.start.line - 1
      const endLine = node.loc.end.line - 1

      // Check if function has JSDoc comment and get the comment text
      const docResult = getJSDocComment(node, sourceCode)
      const isDocumented = docResult.hasDoc

      // If the function is documented, add it to documentedFunctions
      if (isDocumented && docResult.docText) {
        documentedFunctions.push({
          name: functionName,
          documentation: docResult.docText,
          filePath,
        })
      }

      functions.push({
        name: functionName,
        node: node,
        filePath,
        startLine,
        endLine,
        sourceCode: sourceCode
          .split("\n")
          .slice(startLine, endLine + 1)
          .join("\n"),
        isDocumented,
        cleanedDoc: docResult.docText,
      })
    }

    // Traverse child nodes
    for (const key in node) {
      if (node[key] && typeof node[key] === "object") {
        traverse(node[key])
      }
    }
  }

  traverse(ast)
}

/**
 * Gets the JSDoc comment for a given node and returns both its presence and content.
 * @param {any} node - The AST node to check for a JSDoc comment.
 * @param {string} sourceCode - The source code as a string to search for comments.
 * @returns {{ hasDoc: boolean, docText?: string }} Object containing whether a JSDoc exists and its content if found.
 */
function getJSDocComment(
  node: any,
  sourceCode: string
): { hasDoc: boolean; docText?: string } {
  if (!node.loc) return { hasDoc: false }

  const lines = sourceCode.split("\n")
  const functionStartLine = node.loc.start.line - 1
  let currentLine = functionStartLine - 1
  let docLines: string[] = []
  let insideComment = false

  while (currentLine >= 0) {
    const line = lines[currentLine].trim()
    if (line === "") {
      currentLine--
      continue
    }
    if (line.startsWith("/**")) {
      insideComment = true
      docLines.unshift(line)
      break
    }
    if (insideComment || line.startsWith("*") || line.startsWith("*/")) {
      docLines.unshift(line)
    }
    if (!line.startsWith("*") && !line.startsWith("*/") && !insideComment) {
      break
    }
    currentLine--
  }

  if (docLines.length > 0) {
    return {
      hasDoc: true,
      docText: docLines.join("\n"),
    }
  }

  return { hasDoc: false }
}
