/* eslint-disable @typescript-eslint/no-explicit-any */
//Relax the no-explicit-any rule for this file as it's a generic validator creator

/**
 * createValidator - builds validators with error handling
 *
 * Validators are callable functions that receive Session and UI primitives
 * and can add reminders based on session state and file modifications.
 */

import type { Session } from "./session.js";
import type { UI } from "./ui.js";

export interface ValidatorContext {
  session: Session;
  ui: UI;
}

/**
 * Callable validator function with metadata properties
 */
export interface ValidatorFn<TOptions = any> {
  (session: Session, ui: UI, options?: TOptions): Promise<void>;
  name: string;
  description?: string;
}

export interface ValidatorConfig<TOptions = any> {
  name: string;
  description?: string;
  validate: (
    context: ValidatorContext,
    options?: TOptions,
  ) => void | Promise<void>;
}

/**
 * Create a validator function with error handling
 */
export function createValidator<TOptions = any>(
  config: ValidatorConfig<TOptions>,
): ValidatorFn<TOptions> {
  const fn = async (session: Session, ui: UI, options?: TOptions) => {
    try {
      const context: ValidatorContext = {
        session,
        ui,
      };

      await config.validate(context, options);
    } catch (error) {
      // add error reminder but don't throw
      ui.addReminder({
        message: `Validator "${config.name}" failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        priority: "high",
      });

      // log to stderr for debugging
      if (process.env.DEBUG) {
        console.error(`[createValidator] Error in "${config.name}":`, error);
      }
    }
  };

  // attach metadata using Object.defineProperty to avoid read-only errors
  Object.defineProperty(fn, "name", {
    value: config.name,
    writable: false,
    configurable: true,
  });

  Object.defineProperty(fn, "description", {
    value: config.description,
    writable: false,
    configurable: true,
  });

  return fn as ValidatorFn<TOptions>;
}

/**
 * Run multiple validators in sequence
 */
export async function runValidators(
  validators: ValidatorFn[],
  session: Session,
  ui: UI,
): Promise<void> {
  for (const validator of validators) {
    await validator(session, ui);
  }
}
