import { addGlobalEventProcessor, getCurrentHub } from '@sentry/hub';
import { Integration, SentryEvent, SentryEventHint } from '@sentry/types';
import { isError } from '@sentry/utils/is';
import { logger } from '../../../utils/logger';

/**
 * Just an Error object with arbitrary attributes attached to it.
 */
interface ExtendedError extends Error {
  [key: string]: unknown;
}

/** Patch toString calls to return proper name for wrapped functions */
export class ExtraErrorData implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = ExtraErrorData.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'ExtraErrorData';

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor(async (event: SentryEvent, hint?: SentryEventHint) => {
      const self = getCurrentHub().getIntegration(ExtraErrorData);
      if (!self) {
        return event;
      }
      return self.enhanceEventWithErrorData(event, hint);
    });
  }

  /**
   * Attaches extracted information from the Error object to extra field in the SentryEvent
   */
  public enhanceEventWithErrorData(event: SentryEvent, hint?: SentryEventHint): SentryEvent {
    if (!hint || !hint.originalException || !isError(hint.originalException)) {
      return event;
    }

    const errorData = this.extractErrorData(hint.originalException);

    if (errorData) {
      return {
        ...event,
        extra: {
          ...event.extra,
          ...errorData,
        },
      };
    }

    return event;
  }

  /**
   * Extract extra information from the Error object
   */
  private extractErrorData(error: ExtendedError): { [key: string]: unknown } | null {
    // We are trying to enhance already existing event, so no harm done if it won't succeed
    try {
      const nativeKeys = ['name', 'message', 'stack', 'line', 'column', 'fileName', 'lineNumber', 'columnNumber'];
      const name = error.name || error.constructor.name;
      const errorKeys = Object.getOwnPropertyNames(error).filter(key => nativeKeys.indexOf(key) === -1);

      if (errorKeys.length) {
        const extraErrorInfo: { [key: string]: unknown } = {};
        for (const key of errorKeys) {
          let value = error[key];
          if (isError(value)) {
            value = (value as Error).name || (value as Error).constructor.name;
          }
          extraErrorInfo[key] = value;
        }
        return {
          [name]: extraErrorInfo,
        };
      }

      return null;
    } catch (oO) {
      logger.error('Unable to extract extra data from the Error object:', oO);
      return null;
    }
  }
}
