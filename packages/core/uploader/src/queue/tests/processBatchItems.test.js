import {
    FILE_STATES,
} from "@rpldy/shared/src/tests/mocks/rpldy-shared.mock";
import getQueueState from "./mocks/getQueueState.mock";
import { getItemsPrepareUpdater } from "../preSendPrepare";
import processFinishedRequest from "../processFinishedRequest";

jest.mock("../preSendPrepare");
jest.mock("../processFinishedRequest");

describe("processBatchItems tests", () => {
    let processBatchItems;
    const mockNext = jest.fn();
    const mockPreparePreRequestItems = jest.fn();
    const waitForTest = () => Promise.resolve();

    beforeAll(() => {
        getItemsPrepareUpdater.mockReturnValue(mockPreparePreRequestItems);
        processBatchItems = require("../processBatchItems").default;
    });

    beforeEach(() => {
        clearJestMocks(
            processFinishedRequest,
            mockPreparePreRequestItems,
            mockNext
        );
    });

    const requestResponse = {};

    const sendResult = {
        abort: jest.fn(),
        request: Promise.resolve(requestResponse),
    };

    const batchOptions = {
        autoUpload: true,
        destination: {}
    };

    const getMockStateData = (itemState = FILE_STATES.ADDED) => ({
        items: {
            "u1": { id: "u1", batchId: "b1", state: itemState },
            "u2": { id: "u2", batchId: "b2", state: itemState },
        },
        batches: {
            "b1": {
                batch: { id: "b1" },
                batchOptions
            },
            "b2": {
                batch: { id: "b2" },
                batchOptions
            }
        },
        aborts: {}
    });

    describe("preparePreRequestItems tests", () => {
        it("should return items from subject using preparePreRequestItems-retrieveItemsFromSubject", () => {
            const items = [1, 2];
            expect(getItemsPrepareUpdater.mock.calls[0][1](items))
                .toBe(items);
        });

        it("should return subject using preparePreRequestItems-createEventSubject", () => {
            const items = [1, 2], options = { test: true };
            expect(getItemsPrepareUpdater.mock.calls[0][2](items, options))
                .toStrictEqual({ items, options });
        });
    });

    it("should send allowed item", async () => {
        const queueState = getQueueState(getMockStateData());

        queueState.runCancellable.mockResolvedValueOnce(false);
        queueState.sender.send.mockReturnValueOnce(sendResult);

        mockPreparePreRequestItems.mockResolvedValueOnce({
            items: [queueState.getState().items.u1],
            options: batchOptions,
        });

        await processBatchItems(queueState, ["u1"], mockNext);
        await waitForTest();

        expect(queueState.sender.send).toHaveBeenCalledWith(
            [queueState.state.items.u1],
            queueState.state.batches["b1"].batch,
            batchOptions);

        expect(processFinishedRequest).toHaveBeenCalledTimes(1);

        expect(processFinishedRequest)
            .toHaveBeenCalledWith(queueState, [{ id: "u1", info: requestResponse }], mockNext);

        expect(queueState.getState().aborts.u1).toBe(sendResult.abort);

        expect(mockNext).toHaveBeenCalledWith(queueState);
    });

    it("should handle item that's already aborted when returned from pre-send", async () => {
        const queueState = getQueueState(getMockStateData());

        queueState.runCancellable.mockResolvedValueOnce(false);

        mockPreparePreRequestItems.mockResolvedValueOnce({
            items: [
                queueState.getState().items.u1,
                {
                    ...queueState.getState().items.u2,
                    state: FILE_STATES.ABORTED,
                }],
        });

        await processBatchItems(queueState, ["u1"], mockNext);
        await waitForTest();

        expect(queueState.sender.send).not.toHaveBeenCalled();
    });

    it("should handle batch no longer available after prepare", async () => {
        const data = getMockStateData();
        delete data.batches["b1"];
        const queueState = getQueueState(data);

        queueState.runCancellable.mockResolvedValueOnce(false);

        mockPreparePreRequestItems.mockResolvedValueOnce({
            items: [queueState.getState().items.u1],
            options: batchOptions,
        });

        await processBatchItems(queueState, ["u1"], mockNext);
        await waitForTest();

        expect(queueState.sender.send).not.toHaveBeenCalled();
    });

    describe("items with finalized state test", () => {
        it.each([
            [FILE_STATES.ABORTED],
            [FILE_STATES.FINISHED],
            [FILE_STATES.ERROR],
            [FILE_STATES.CANCELLED],
        ])("should not send items that have finalized state", async (state) => {
            const queueState = getQueueState(getMockStateData(state));

            queueState.runCancellable
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(false);

            await processBatchItems(queueState, ["u1", "u2"], mockNext);
            await waitForTest();

            expect(queueState.sender.send).not.toHaveBeenCalled();
        });
    });

    it("should send allowed (multiple) items", async () => {
        const queueState = getQueueState(getMockStateData());

        queueState.runCancellable
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(false);

        queueState.sender.send.mockReturnValueOnce(sendResult);

        mockPreparePreRequestItems.mockResolvedValueOnce({
            items: [
                queueState.getState().items.u1,
                queueState.getState().items.u2
            ],
            options: batchOptions,
        });

        await processBatchItems(queueState, ["u1", "u2"], mockNext);
        await waitForTest();

        expect(queueState.sender.send).toHaveBeenCalledWith(
            Object.values(queueState.state.items),
            queueState.state.batches["b1"].batch,
            batchOptions);

        expect(processFinishedRequest).toHaveBeenCalledTimes(1);

        expect(processFinishedRequest)
            .toHaveBeenCalledWith(queueState, [
                { id: "u1", info: requestResponse },
                { id: "u2", info: requestResponse }], mockNext);

        expect(queueState.getState().aborts.u1).toBe(sendResult.abort);
        expect(queueState.getState().aborts.u2).toBe(sendResult.abort);
    });

    it("should report cancelled items", async () => {
        const queueState = getQueueState(getMockStateData());

        queueState.runCancellable
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true);

        await processBatchItems(queueState, ["u1", "u2"], mockNext);

        expect(queueState.sender.send).not.toHaveBeenCalled();

        expect(processFinishedRequest).toHaveBeenCalledTimes(1);

        expect(processFinishedRequest)
            .toHaveBeenCalledWith(queueState,
                [{ id: "u1", info: { state: FILE_STATES.CANCELLED, response: "cancel", status: 0 } },
                    {
                        id: "u2",
                        info: { state: FILE_STATES.CANCELLED, response: "cancel", status: 0}
                    }], mockNext);

        expect(queueState.state.items.u1.abort).toBeUndefined();
        expect(queueState.state.items.u2.abort).toBeUndefined();
    });

    it("should send allowed and report cancelled both", async () => {
        const queueState = getQueueState(getMockStateData());

        queueState.runCancellable
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);

        mockPreparePreRequestItems.mockResolvedValueOnce({
            items: [
                queueState.getState().items.u1,
            ],
            options: batchOptions,
        });

        queueState.sender.send.mockReturnValueOnce(sendResult);

        await processBatchItems(queueState, ["u1", "u2"], mockNext);
        await waitForTest();

        expect(queueState.sender.send).toHaveBeenCalledWith(
            [queueState.state.items.u1],
            queueState.state.batches["b1"].batch,
            batchOptions);

        expect(processFinishedRequest).toHaveBeenCalledTimes(2);

        expect(processFinishedRequest)
            .toHaveBeenCalledWith(queueState,
                [{ id: "u1", info: requestResponse }], mockNext);

        expect(processFinishedRequest)
            .toHaveBeenCalledWith(queueState,
                [{
                    id: "u2",
                    info: { state: FILE_STATES.CANCELLED, response: "cancel", status: 0 }
                }], mockNext);

        expect(queueState.getState().aborts.u1).toBe(sendResult.abort);
        expect(queueState.getState().aborts.u2).toBeUndefined();
    });

	it("should allow prepare to cancel", async() => {
		const queueState = getQueueState(getMockStateData());

        mockPreparePreRequestItems.mockResolvedValueOnce({
           cancelled: true,
        });

		queueState.runCancellable
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(false);

		await processBatchItems(queueState, ["u1", "u2"], mockNext);

		expect(Object.values(queueState.getState().items))
			.toEqual(Object.values(getMockStateData().items));

		expect(queueState.getState().batches["b1"].batchOptions)
			.toEqual(getMockStateData().batches["b1"].batchOptions);

		expect(queueState.sender.send).not.toHaveBeenCalled();
	});

    it("should mark item as failed for unexpected sender exception", async () => {
        const queueState = getQueueState(getMockStateData());

        queueState.runCancellable.mockResolvedValueOnce(false);
        queueState.sender.send.mockImplementationOnce(() => {
            throw new Error("SENDER FAIL");
        });

        mockPreparePreRequestItems.mockResolvedValueOnce({
            items: [queueState.getState().items.u1],
            options: batchOptions,
        });

        await processBatchItems(queueState, ["u1"], mockNext);
        await waitForTest();

        expect(processFinishedRequest.mock.calls[0][1]).toStrictEqual([{
            id: "u1",
            info: { status: 0, state: FILE_STATES.ERROR, response: "SENDER FAIL" },
        }]);

        expect(queueState.getState().aborts["u1"]()).toBe(false);
    });

    it("should catch prepare invalid user-land response and report error", async () => {
        const queueState = getQueueState(getMockStateData());
        const error = new Error("invalid response");
        mockPreparePreRequestItems.mockRejectedValueOnce(error);

        queueState.runCancellable.mockResolvedValueOnce(false);

        await processBatchItems(queueState, ["u1"], mockNext);
        await waitForTest();

        expect(processFinishedRequest.mock.calls[0][1]).toStrictEqual([{
            id: "u1",
            info: { status: 0, state: FILE_STATES.ERROR, response: error },
        }]);

        expect(queueState.sender.send).not.toHaveBeenCalled();
    });
});
