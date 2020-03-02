// @flow
import { BATCH_STATES, createBatchItem } from "@rpldy/shared";
import { DEFAULT_FILTER } from "./defaults";

import type {
    UploadInfo,
    BatchItem,
    Batch,
    FileFilterMethod,
    CreateOptions,
} from "@rpldy/shared";

let bCounter = 0;

const processFiles = (batchId, files: UploadInfo, fileFilter: ?FileFilterMethod): BatchItem[] =>
    Array.prototype
        .filter.call(files, fileFilter || DEFAULT_FILTER)
        .map((f) => createBatchItem(f, batchId));

export default (files: UploadInfo | UploadInfo[], uploaderId: string, options: CreateOptions): Batch => {
    bCounter += 1;
    const id = `batch-${bCounter}`;

    files = (Array.isArray(files) || files instanceof FileList) ? files : [files];

    return {
        id,
        uploaderId,
        items: processFiles(id, files, options.fileFilter),
        state: BATCH_STATES.ADDED,
        completed: 0,
        loaded: 0,
    };
};
