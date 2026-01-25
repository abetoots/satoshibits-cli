/**
 * UI primitive - provides methods for displaying reminders to the user
 *
 * In production, reminders are written to stdout.
 * For testing, use createTestUI() to capture reminders.
 */

export interface Reminder {
  message: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  file?: string;
  skillName?: string;
}

export interface UI {
  /**
   * Add a single reminder
   */
  addReminder(reminder: Reminder): void;

  /**
   * Add multiple reminders at once
   */
  addReminders(reminders: Reminder[]): void;
}

/**
 * Create a production UI instance that writes to stdout
 */
export function createUI(): UI {
  const reminders: Reminder[] = [];

  return {
    addReminder(reminder: Reminder): void {
      reminders.push(reminder);
    },

    addReminders(newReminders: Reminder[]): void {
      reminders.push(...newReminders);
    },

    // internal method to flush reminders (called by validator framework)
    _flush(): void {
      if (reminders.length === 0) return;

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 VALIDATION REMINDERS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      reminders.forEach(reminder => {
        const icon = getPriorityIcon(reminder.priority);
        console.log(`${icon} ${reminder.message}`);

        if (reminder.file) {
          console.log(`   Affected file: ${reminder.file}`);
        }

        if (reminder.skillName) {
          console.log(`   Related skill: ${reminder.skillName}`);
        }

        console.log('');
      });

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
  } as UI & { _flush(): void };
}

/**
 * Create a test UI instance that collects reminders for assertions
 */
export function createTestUI(): UI & { getReminders(): Reminder[] } {
  const reminders: Reminder[] = [];

  return {
    addReminder(reminder: Reminder): void {
      reminders.push(reminder);
    },

    addReminders(newReminders: Reminder[]): void {
      reminders.push(...newReminders);
    },

    getReminders(): Reminder[] {
      return [...reminders];
    }
  };
}

function getPriorityIcon(priority?: Reminder['priority']): string {
  switch (priority) {
    case 'critical':
      return '🚨';
    case 'high':
      return '⚠️';
    case 'medium':
      return '💡';
    case 'low':
    default:
      return 'ℹ️';
  }
}
