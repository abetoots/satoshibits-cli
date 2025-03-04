# `satoshibits-cli`

[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier) [![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/) [![license](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/wtchnm/Vitamin/blob/main/LICENSE)

This is a monorepo for managing and publishing CLI packages responsible for generating templates.

## Getting started

You can find each CLI's instructions in their respective READMEs.

## Working within the monorepo

- When introducing changes that do not require any packages to be published:

  1. Git add your changes.
  2. `pnpm run commit:cz`

- When introducing changes that should trigger a package to be published:

  1. Git add your changes. Group your changes to the relevant package.
  2. `pnpm run commit:publish`
  3. Make sure you've set your `NPM_AUTH_TOKEN` secret in Github or else this will fail. You can generate one [here]("https://www.npmjs.com/settings/satoshibits/tokens/granular-access-tokens/new")
