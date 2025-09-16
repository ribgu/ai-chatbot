type ErrorBody = {
  error?: {
    message?: unknown
    type?: unknown
    code?: unknown
    param?: unknown
  }
  message?: unknown
  code?: unknown
  type?: unknown
  detail?: unknown
  errors?: unknown
}

const STATUS_MESSAGE_MAP: Record<number, string> = {
  400: 'A solicitação enviada ao Copilot é inválida.',
  401: 'A chave de API do Copilot é inválida ou não foi informada.',
  403: 'O Copilot recusou a solicitação. Verifique as permissões da chave de API.',
  404: 'O recurso solicitado no Copilot não foi encontrado.',
  408: 'A solicitação ao Copilot expirou. Tente novamente.',
  409: 'O Copilot está processando uma solicitação semelhante. Aguarde e tente novamente.',
  422: 'O Copilot não conseguiu processar a solicitação enviada.',
  429: 'O Copilot retornou limite de requisições. Aguarde e tente novamente.',
  500: 'O Copilot encontrou um erro interno.',
  502: 'O serviço do Copilot retornou uma resposta inválida.',
  503: 'O Copilot está indisponível no momento. Tente novamente mais tarde.',
  504: 'O Copilot demorou para responder. Tente novamente em instantes.',
}

export function getCopilotFallbackMessage(status: number): string {
  return STATUS_MESSAGE_MAP[status] ?? 'Não foi possível comunicar com o Copilot no momento.'
}

function toStringOrUndefined(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value.toString()
  return undefined
}

function extractErrorFields(body: ErrorBody | undefined) {
  if (!body) return {}

  const candidate = typeof body.error === 'object' && body.error !== null ? body.error : body

  return {
    message: toStringOrUndefined((candidate as ErrorBody['error'])?.message),
    type: toStringOrUndefined((candidate as ErrorBody['error'])?.type),
    code: toStringOrUndefined((candidate as ErrorBody['error'])?.code),
    param: (candidate as ErrorBody['error'])?.param,
  }
}

export interface CopilotAPIErrorOptions {
  message: string
  status: number
  code?: string
  type?: string
  requestId?: string
  details?: unknown
  rawBody?: string
  cause?: unknown
}

export class CopilotAPIError extends Error {
  readonly status: number
  readonly code?: string
  readonly type: string
  readonly requestId?: string
  readonly details?: unknown
  readonly rawBody?: string

  constructor({
    message,
    status,
    code,
    type = 'copilot_api_error',
    requestId,
    details,
    rawBody,
    cause,
  }: CopilotAPIErrorOptions) {
    super(message)
    this.name = 'CopilotAPIError'
    this.status = status
    this.code = code
    this.type = type
    this.requestId = requestId
    this.details = details
    this.rawBody = rawBody

    if (cause !== undefined) {
      const withCause = this as Error & { cause?: unknown }
      withCause.cause = cause
    }
  }

  toResponseBody() {
    return {
      error: {
        message: this.message,
        type: this.type,
        code: this.code ?? this.type,
        param: null,
      },
    }
  }
}

export async function buildCopilotAPIError(response: Response): Promise<CopilotAPIError> {
  const requestId =
    response.headers.get('x-request-id') ??
    response.headers.get('x-github-request-id') ??
    response.headers.get('x-ms-request-id') ??
    undefined

  const rawBody = await response.text()
  let parsedBody: ErrorBody | undefined

  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      parsedBody = undefined
    }
  }

  const fields = extractErrorFields(parsedBody)
  const fallbackMessage = getCopilotFallbackMessage(response.status)
  const message = fields.message?.trim() ? fields.message : fallbackMessage

  return new CopilotAPIError({
    message,
    status: response.status,
    code: fields.code,
    type: fields.type ?? 'copilot_api_error',
    requestId,
    details: parsedBody ?? rawBody,
    rawBody,
  })
}

export function buildCopilotConnectionError(error: unknown): CopilotAPIError {
  return new CopilotAPIError({
    message: 'Não foi possível se conectar ao Copilot. Verifique a sua rede e a chave de API.',
    status: 503,
    code: 'copilot_unreachable',
    type: 'service_unavailable',
    cause: error,
  })
}
