import { EngineStatus } from "@stellarfw/common/lib/enums/engine-status.enum";
import { LogLevel } from "@stellarfw/common/lib/enums/log-level.enum";
import { Action, ProcessingAction } from "@stellarfw/common/lib";
import { Satellite } from "@stellarfw/common/lib";
import { UnknownActionException, IActionProcessor } from "@stellarfw/common";
import { ACTION_METADATA } from "@stellarfw/common/lib/constants";
import { Connection } from "@stellarfw/common/lib";

type ActionProcessorCallback = (data: any) => void;

enum ActionStatus {
  SERVER_ERROR = "server_error",
  SERVER_SHUTTING_DOWN = "server_shutting_down",
  TOO_MANY_REQUESTS = "too_many_requests",
  UNKNOWN_ACTION = "unknown_action",
  UNSUPPORTED_SERVER_TYPE = "unsupported_server_type",
  VALIDATOR_ERRORS = "validator_errors",
  RESPONSE_TIMEOUT = "response_timeout",
  OTHER = "other",
}

class ActionProcessor implements IActionProcessor {
  /**
   * API instance.
   */
  private api: any;

  /**
   * Connection instance.
   */
  public connection!: Connection;

  /**
   * Action name
   */
  private action!: string;

  /**
   * Action class.
   */
  private actionInstance!: ProcessingAction;

  /**
   * Action's metadata.
   */
  private actionMetadata: Action = {} as Action;

  /**
   * Action status.
   */
  private actionStatus!: ActionStatus;

  private toProcess: boolean = true;

  /**
   * Inform if the action response must be rendered.
   */
  public toRender: boolean = true;

  /**
   * Message identifier.
   */
  private messageCount!: number;

  /**
   * Action parameters.
   */
  private params: { [key: string]: any } = {};

  /**
   * Map with all validator errors.
   */
  private validatorErrors: Map<string, string> = new Map();

  /**
   * Timestamp when the action was started to be processed.
   */
  private actionStartTime!: number;

  /**
   * Informers when the action is being processed.
   */
  private working: boolean = false;

  /**
   * Action response.
   */
  private response: any = {};

  /**
   * Duration that the action took to be completed.
   */
  private duration!: number;

  /**
   * Timeout identifier.
   */
  private timeoutTimer!: NodeJS.Timer;

  /**
   * To ensure that the action won't respond twice when an timeout error
   * is thrown.
   */
  private errorRendered: boolean = false;

  private callback: ActionProcessorCallback;

  /**
   * Create a new action processor instance.
   *
   * @param api API reference.
   * @param connection Connection object.
   */
  constructor(api: {}, connection: Connection, callback: ActionProcessorCallback) {
    this.api = api;
    this.connection = connection;
    this.messageCount = connection.messageCount;
    this.params = connection.params;
    this.callback = callback;
  }

  /**
   * Increment the pending actions for this connection.
   *
   * @param count
   */
  public incrementPendingActions(count: number = 1): void {
    this.connection.pendingActions += count;
  }

  /**
   * Increment the total number of executed actions for this connection.
   *
   * @param count
   */
  private incrementTotalActions(count: number = 1): void {
    this.connection.totalActions += count;
  }

  /**
   * Get the number of pending action for this connection.
   */
  private getPendingActionCount(): number {
    return this.connection.pendingActions;
  }

  /**
   * Complete the action execution.
   *
   * @param status Action status or an error.
   */
  public completeAction(status?: ActionStatus, error?: Error) {
    switch (status) {
      case ActionStatus.SERVER_ERROR:
        error = this.api.configs.errors.serverErrorMessage;
        break;
      case ActionStatus.SERVER_SHUTTING_DOWN:
        error = this.api.configs.errors.serverShuttingDown;
        break;
      case ActionStatus.TOO_MANY_REQUESTS:
        error = this.api.configs.errors.tooManyPendingActions();
        break;
      case ActionStatus.UNKNOWN_ACTION:
        error = this.api.configs.errors.unknownAction(this.action);
        break;
      case ActionStatus.UNSUPPORTED_SERVER_TYPE:
        error = this.api.configs.errors.unsupportedServerType(this.connection.type);
        break;
      case ActionStatus.VALIDATOR_ERRORS:
        error = this.api.configs.errors.invalidParams(this.validatorErrors);
        break;
      case ActionStatus.RESPONSE_TIMEOUT:
        error = this.api.configs.errors.responseTimeout(this.action);
        break;
    }

    if (error && typeof error === "string") {
      error = new Error(error);
    }

    if (error && !this.response.error) {
      if (typeof this.response === "string" || Array.isArray(this.response)) {
        this.response = error.toString();
      } else {
        this.response.error = error;
      }
    }

    this.incrementPendingActions(-1);
    this.duration = new Date().getTime() - this.actionStartTime;

    if (this.callback) {
      this.callback(this);
    }

    this.working = false;
    this.logAction(error);
  }

  /**
   * Log the action execution.
   *
   * @param error Error that occurred during the action processing, if exists.
   */
  private logAction(error?: Error) {
    let logLevel = LogLevel.Info;

    // check if the action have a specific log level
    if (this.actionMetadata.logLevel) {
      logLevel = this.actionMetadata.logLevel;
    }

    const filteredParams = {};
    for (const i in this.params) {
      if (this.api.configs.general.filteredParams && this.api.configs.general.filteredParams.indexOf(i) >= 0) {
        filteredParams[i] = "[FILTERED]";
      } else if (typeof this.params[i] === "string") {
        filteredParams[i] = this.params[i].substring(0, this.api.configs.logger.maxLogStringLength);
      } else {
        filteredParams[i] = this.params[i];
      }
    }

    const logLine = {
      to: this.connection.remoteIP,
      action: this.action,
      params: JSON.stringify(filteredParams),
      duration: this.duration,
      error: "",
    };

    if (error) {
      if (error instanceof Error) {
        logLine.error = String(error);
      } else {
        try {
          logLine.error = JSON.stringify(error);
        } catch (e) {
          logLine.error = String(error);
        }
      }
    }

    // log the action execution
    this.api.log(`[ action @  ${this.connection.type}]`, logLevel, logLine);
  }

  private async preProcessAction() {
    // If the action is private this can only be executed internally
    if (this.actionMetadata.private === true && this.connection.type !== "internal") {
      throw new Error(this.api.config.errors.privateActionCalled(this.actionMetadata.name));
    }

    // Copy call parameters into the action instance
    this.actionInstance.params = this.params;

    const processorsNames = this.api.actions.globalMiddleware.slice(0);

    // get action processor names
    if (this.actionMetadata.middleware) {
      this.actionMetadata.middleware.forEach((m) => {
        processorsNames.push(m);
      });
    }

    for (const key in Object.keys(processorsNames)) {
      if (!processorsNames.hasOwnProperty(key)) {
        continue;
      }

      const name = processorsNames[key];

      if (typeof this.api.actions.middleware[name].preProcessor === "function") {
        await this.api.actions.middleware[name].preProcessor(this);
      }
    }
  }

  /**
   * Instantiate the requested action.
   */
  private instantiateAction() {
    if (this.api.actions.versions[this.action]) {
      if (!this.params.apiVersion) {
        this.params.apiVersion =
          this.api.actions.versions[this.action][this.api.actions.versions[this.action].length - 1];
      }

      const actionClass = this.api.actions.actions[this.action][this.params.apiVersion];

      this.actionMetadata = Reflect.getMetadata(ACTION_METADATA, actionClass);
      this.actionInstance = new actionClass(this.api, this);
      return;
    }

    throw new UnknownActionException();
  }

  /**
   * Process the action.
   */
  public processAction(): void {
    // Initialize processing environment
    this.actionStartTime = new Date().getTime();
    this.working = true;
    this.incrementTotalActions();
    this.incrementPendingActions();
    this.action = this.params.action;

    try {
      this.instantiateAction();
    } catch (e) {
      this.completeAction(ActionStatus.UNKNOWN_ACTION);
      return;
    }

    if (this.api.status !== EngineStatus.Running) {
      this.completeAction(ActionStatus.SERVER_SHUTTING_DOWN);
    } else if (this.getPendingActionCount() > this.api.configs.general.simultaneousActions) {
      this.completeAction(ActionStatus.TOO_MANY_REQUESTS);
    } else if (
      this.actionMetadata.blockedConnectionTypes &&
      this.actionMetadata.blockedConnectionTypes.includes(this.connection.type)
    ) {
      this.completeAction(ActionStatus.UNSUPPORTED_SERVER_TYPE);
    } else {
      try {
        this.runAction();
      } catch (error) {
        this.api.exceptionHandlers.action(error, this);
        this.completeAction(ActionStatus.SERVER_ERROR);
      }
    }
  }

  /**
   * Validate call params with the action requirements.
   */
  private validateParams() {
    const toValidate = {};

    for (const key in this.actionMetadata.inputs) {
      if (!this.actionMetadata.inputs.hasOwnProperty(key)) {
        continue;
      }

      const props = this.actionMetadata.inputs[key];

      // Default
      if (this.params[key] === undefined && props.default !== undefined) {
        if (typeof props.default === "function") {
          this.params[key] = props.default(this);
        } else {
          this.params[key] = props.default;
        }
      }

      // Format the input to the requested type
      if (props.format && this.params[key]) {
        if (typeof props.format === "function") {
          this.params[key] = props.format.call(this.api, this.params[key], this);
        } else if (props.format === "integer") {
          this.params[key] = Number.parseInt(this.params[key]);
        } else if (props.format === "float") {
          this.params[key] = Number.parseFloat(this.params[key]);
        } else if (props.format === "string") {
          this.params[key] = String(this.params[key]);
        }

        if (Number.isNaN(this.params[key])) {
          this.validatorErrors.set(key, this.api.config.errors.paramInvalidType(key, props.format));
        }
      }

      // convert the required property to a validator to unify the validation
      // system
      if (props.required === true) {
        // FIXME: this will throw an error when the validator is a function
        props.validator = !props.validator ? "required" : "required|" + props.validator;
      }

      // add the field to the validation hash
      if (props.validator) {
        toValidate[key] = props.validator;
      }
    }

    // Execute all validators. If there is found some error on the validations,
    // the error map must be attributed to `validatorErrors`
    const response = this.api.validator.validate(this.params, toValidate);
    if (response !== true) {
      this.validatorErrors = response;
    }
  }

  private actionTimeout(): void {
    this.completeAction(ActionStatus.RESPONSE_TIMEOUT);
    this.errorRendered = true;
  }

  /**
   * Operations to be performed after the action execution
   */
  private async postProcessAction(): Promise<void> {
    const processorNames = this.api.actions.globalMiddleware.slice(0);

    if (this.actionMetadata.middleware) {
      this.actionMetadata.middleware.forEach((m) => {
        processorNames.push(m);
      });
    }

    for (const name of processorNames) {
      await this.api.actions.middleware[name].postProcessor(this);
    }
  }

  /**
   * Run action.
   */
  public async runAction(): Promise<void> {
    try {
      await this.preProcessAction();
    } catch (error) {
      this.completeAction(undefined, error);
      return;
    }

    // Validate the request parameters with the action's requirements
    // TODO: maybe change validateParams to throw when there is an error
    this.validateParams();

    if (this.validatorErrors.size > 0) {
      this.completeAction(ActionStatus.VALIDATOR_ERRORS);
      return;
    }

    // Ignore when the action is marked to don't be processed
    if (this.toProcess !== true) {
      this.completeAction(ActionStatus.OTHER);
      return;
    }

    // Create a time that will be used to timeout the action if needed,
    // When the timeout is reached an error is thrown and sent to the
    // client.
    this.timeoutTimer = setTimeout(this.actionTimeout.bind(this), this.api.configs.general.actionTimeout);

    try {
      this.response = await this.actionInstance.run();
    } catch (error) {
      clearTimeout(this.timeoutTimer);
      this.completeAction(undefined, error);
      return;
    }

    // If the action returns an undefined fallback it to
    // an object.
    if (this.response === undefined) {
      this.response = {};
    }

    // Clear the timeout timer
    clearTimeout(this.timeoutTimer);

    // When the error rendered flag is set we don't send a response
    if (this.errorRendered) {
      return;
    }

    try {
      await this.postProcessAction();
      this.completeAction();
    } catch (error) {
      this.completeAction(undefined, error);
    }
  }
}

export default class ActionProcessorSatellite extends Satellite {
  protected _name = "ActionProcessor";
  public loadPriority = 430;

  public async load(): Promise<void> {
    this.api.ActionProcessor = ActionProcessor;
  }
}
