// Structured logging for the worker service

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogMeta {
  [key: string]: unknown;
  agentId?: string;
  taskId?: string;
  companyId?: string;
  duration?: number;
  tokens?: number;
  cost?: number;
  error?: string;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  meta?: LogMeta;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private readonly service: string;
  private readonly minLevel: LogLevel;
  private readonly enableJson: boolean;

  constructor(service: string, minLevel: LogLevel = 'info', enableJson: boolean = false) {
    this.service = service;
    this.minLevel = minLevel;
    this.enableJson = process.env.LOG_FORMAT === 'json' || enableJson;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private formatMessage(level: LogLevel, message: string, meta?: LogMeta): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      meta,
    };

    if (this.enableJson) {
      return JSON.stringify(entry);
    }

    const timestamp = new Date().toLocaleTimeString();
    const levelStr = level.toUpperCase().padEnd(5);
    const serviceStr = `[${this.service}]`;
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';

    return `${timestamp} ${levelStr} ${serviceStr} ${message}${metaStr}`;
  }

  debug(message: string, meta?: LogMeta): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, meta));
    }
  }

  info(message: string, meta?: LogMeta): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, meta));
    }
  }

  warn(message: string, meta?: LogMeta): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, meta));
    }
  }

  error(message: string, meta?: LogMeta): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, meta));
    }
  }

  // Child logger with additional context
  child(context: LogMeta): Logger {
    const childLogger = new Logger(this.service, this.minLevel, this.enableJson);
    const originalLog = childLogger.info.bind(childLogger);

    // Override methods to include context
    const createMethod = (level: LogLevel) => (message: string, meta?: LogMeta) => {
      const combinedMeta = { ...context, ...meta };
      switch (level) {
        case 'debug':
          console.log(this.formatMessage(level, message, combinedMeta));
          break;
        case 'info':
          console.log(this.formatMessage(level, message, combinedMeta));
          break;
        case 'warn':
          console.warn(this.formatMessage(level, message, combinedMeta));
          break;
        case 'error':
          console.error(this.formatMessage(level, message, combinedMeta));
          break;
      }
    };

    childLogger.debug = createMethod('debug');
    childLogger.info = createMethod('info');
    childLogger.warn = createMethod('warn');
    childLogger.error = createMethod('error');

    return childLogger;
  }
}

// Create default loggers for different services
export const workerLogger = new Logger('worker', (process.env.LOG_LEVEL as LogLevel) || 'info');
export const llmLogger = new Logger('llm', (process.env.LOG_LEVEL as LogLevel) || 'info');
export const taskLogger = new Logger('task', (process.env.LOG_LEVEL as LogLevel) || 'info');
export const agentLogger = new Logger('agent', (process.env.LOG_LEVEL as LogLevel) || 'info');

export { Logger };
