import type { ClassValue as ClsxClassValue } from "clsx"
import { Observable } from "rxjs"

export type ClassValue = ClsxClassValue | Observable<ClassValue>
