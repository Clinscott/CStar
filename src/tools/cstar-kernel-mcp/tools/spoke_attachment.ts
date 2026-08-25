import type { McpRequestContext } from '../contracts/request_context.js';
import { errorResponse, textResponse, type McpTextResponse } from '../contracts/responses.js';
import { executeSpokeAttachment } from './spoke_attachment_controller.js';
import type { SpokeAttachmentToolArgs } from './spoke_schemas.js';

export async function handleSpokeAttachment(
    args: SpokeAttachmentToolArgs,
    requestContext?: McpRequestContext,
): Promise<McpTextResponse> {
    try {
        const result = await executeSpokeAttachment({ args, request_context: requestContext });
        return textResponse(result);
    } catch (error) {
        return errorResponse(error);
    }
}
