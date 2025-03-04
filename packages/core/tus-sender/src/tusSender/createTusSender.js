// @flow
import { logger, hasWindow } from "@rpldy/shared";
import createState from "@rpldy/simple-state";
import { createChunkedSender } from "@rpldy/chunked-sender";
import { getMandatoryOptions } from "../utils";
import handleEvents from "./handleEvents";
import getTusSend from "./tusSend";

import type { UploaderType, UploaderCreateOptions } from "@rpldy/uploader";
import type { TusOptions, State, TusState } from "../types";
import type { TriggerMethod } from "@rpldy/life-events";

const initializeState = (uploader: UploaderType<UploaderCreateOptions>, options: TusOptions): TusState => {
    const { state, update } = createState<State>({
        options,
        items: {},
        featureDetection: {
            extensions: null,
            version: null,
            processed: false,
        }
    });

    const tusState = {
        getState: (): State => state,
        updateState: update,
    };

    if (hasWindow() && logger.isDebugOn()) {
        window[`__rpldy_${uploader.id}_tus_state`] = tusState;
    }

    return tusState;
};

const getResolvedOptions = (options: ?TusOptions): TusOptions => {
    options = getMandatoryOptions(options);

    if ((options.sendDataOnCreate || options.parallel) && options.deferLength) {
        logger.debugLog(`tusSender: turning off deferLength - cannot be used when sendDataOnCreate or parallel is enabled`);
        options.deferLength = false;
    }

    //force chunked for TUS
    options.chunked = true;

    return options;
};

const createTusSender = (
    uploader: UploaderType<UploaderCreateOptions>,
    options: ?TusOptions,
    trigger: TriggerMethod
): {|getOptions: () => TusOptions, send: any|} => {
    options = getResolvedOptions(options);
    const chunkedSender = createChunkedSender(options, trigger);

    const tusState = initializeState(uploader, options);
    handleEvents(uploader, tusState, chunkedSender);

    const send = getTusSend(chunkedSender, tusState);

    return {
        send,
        getOptions: () => tusState.getState().options,
    };
};

export default createTusSender;
