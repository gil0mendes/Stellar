# Stellar Contributing Guide

Hi! I'm really excited that you are interested in contributing to Stellar. Before submitting your contribution through, please make sure to take a moment and read through the following guidelines.

- [Stellar Contributing Guide](#stellar-contributing-guide)
  - [Pull Request Guidelines](#pull-request-guidelines)
  - [Code Style](#code-style)
  - [Development Setup](#development-setup)
  - [Commonly used NPM scripts](#commonly-used-npm-scripts)
  - [Project Structure](#project-structure)

## Pull Request Guidelines

- The `master` branch is basically just a snapshot of the latest stable release. All development should be done in dedicated branches. **Do not submit PRs against the `master` branch**

- Checkout a topic branch from the relevant branch, e.g. `dev`, and merge back against that branch.

- Work in the `src` or `bin` folders and **DO NOT** checkin `dist` in the commits.

- It's OK to have multiple small commits as you work on the PR - we will let GitHub automatically squash it before merging.

- Make sure `npm test` passes. (see [development setup](#development-setup))

- Follow the [code style](#code-style).

- If adding new feature:

  - Add accompanying test case.
  - Provide convincing reason to add this feature. Ideally you should open a suggestion issue first and have it greenlighted before working on it.

- If fixing a bug provide detailed description of the bug in the PR.

## Code Style

- [No semicolons unless necessary](http://inimino.org/~inimino/blog/javascript_semicolons).

- Never starts a line with an array.

- Follow JSDoc.

- 2 space indentation.

- multiple var declarations.

- 1 space after `function` and function names.

- 1 space between arguments, but not between parentheses.

- Use Arrow functions whenever possible.

- You must use ES6 JavaScript.

- When in doubt, read the source code.

## Development Setup

You will need [Node.js](http://nodejs.org) in version 6 ou higher.

After cloning the repo, run:

```bash
$ npm install
```

## Commonly used NPM scripts

```bash
# watch and auto re-build during the development
$ npm run dev

# build all dist files
$ npm run build

# run the full test suit
$ npm test
```

> Note: Stellar is written in JavaScript ES6 with some additional features like class properties, so the source code needs to be transpiled to ES5 in order to be interpreted by the Node.Js 6 or higher.

## Project Structure

- **`bin`**: contains the binary utility to start and execute stellar commands

  - **`commands`**: contains the available commands.

- **`dist`**: contains built files for distribution. Note this directory is only updated when a release happens; they do not reflect the last changes in development branches.

- **`example`**: contains a sample application to be used in the test environment and as an example for developers.

- **`test`**: contains all testes. The unit and integration tests are run using Deno itself.

- **`src`**: contains the source code, obviously. The codebase is written in ES6.

  - **`config`**: contains the Stellar's default configuration.

  - **`satellites`**: contains all core satellites.

  - **`servers`**: contains the code related to servers implementations.

- **`staticFiles`**: contains static files to be used on documentation generation.
