import { NextRequest, NextResponse } from 'next/server'
import { listModels, proxyChatCompletions } from '../../../../../lib/ai/copilot/service'
import { CopilotAPIError } from '../../../../../lib/ai/copilot/errors'
import { initializeProxy } from '../../../../../lib/ai/copilot/proxy'

initializeProxy()

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')
    const models = await listModels(token)
    return NextResponse.json(models)
  } catch (error) {
    return handleCopilotError(
      error,
      'Não foi possível recuperar os modelos do Copilot.'
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const token = request.headers.get('Authorization')
    const response = await proxyChatCompletions(body, token)
    if (body.stream) {
      return new NextResponse(response.body, {
        headers: { "Content-Type": "text/event-stream" }
      })
    }
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    return handleCopilotError(
      error,
      'Não foi possível completar a solicitação no Copilot.'
    )
  }
}

function handleCopilotError(error: unknown, fallbackMessage: string) {
  if (error instanceof CopilotAPIError) {
    console.error('Copilot API error', {
      message: error.message,
      status: error.status,
      code: error.code,
      requestId: error.requestId,
    })

    return NextResponse.json(error.toResponseBody(), {
      status: error.status,
    })
  }

  console.error('Unexpected Copilot proxy error', error)

  return NextResponse.json(
    {
      error: {
        message: fallbackMessage,
        type: 'unexpected_error',
        code: 'copilot_unexpected_error',
        param: null,
      },
    },
    { status: 500 }
  )
}
