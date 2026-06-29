import { PropsWithChildren, Props, Suspense } from "@jsxrx/core"
import { Observable } from "rxjs"

type CountDisplayProps = PropsWithChildren<{
  count?: number
}>

export default function CountDisplay(input$: Observable<CountDisplayProps>) {
  const { count$, children$ } = Props.take(input$, { count: 0 })

  return (
    <>
      <Suspense fallback={<div>Loading count...</div>}>
        <div>The count is {count$}</div>
      </Suspense>
      {children$}
    </>
  )
}
