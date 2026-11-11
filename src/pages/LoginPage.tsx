import { useState } from 'react'
import { Navigate, useLocation, useNavigate, type Location } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/auth/AuthProvider'
import { isApiError } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { FullPageSpinner } from '@/components/ui/Spinner'

const schema = z.object({
  username: z.string().trim().min(1, 'Enter your username'),
  password: z.string().min(1, 'Enter your password'),
})
type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { state, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: Location } | null)?.from
  const redirectTo = from ? from.pathname + from.search : '/'
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  if (state.status === 'loading') return <FullPageSpinner />
  if (state.status === 'authenticated') return <Navigate to={redirectTo} replace />

  const onSubmit = async (values: FormValues) => {
    setFormError(null)
    try {
      await login(values.username, values.password)
      navigate(redirectTo, { replace: true })
    } catch (e) {
      if (isApiError(e)) {
        if (e.code === 'invalid_credentials') {
          setFormError(e.message || 'Wrong username or password.')
          return
        }
        if (e.code === 'validation_error' && e.errors) {
          for (const [field, msgs] of Object.entries(e.errors)) {
            if (field === 'username' || field === 'password') {
              setError(field, { message: msgs.join(' ') })
            } else {
              setFormError(msgs.join(' '))
            }
          }
          return
        }
        setFormError(e.message)
        return
      }
      setFormError('Something went wrong. Please try again.')
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight">Receipt Scanner</h1>
        <Card>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {formError && <Alert tone="error">{formError}</Alert>}

            <Field label="Username" htmlFor="username" error={errors.username?.message}>
              <Input
                id="username"
                autoComplete="username"
                autoCapitalize="none"
                autoFocus
                invalid={!!errors.username}
                {...register('username')}
              />
            </Field>

            <Field label="Password" htmlFor="password" error={errors.password?.message}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                invalid={!!errors.password}
                {...register('password')}
              />
            </Field>

            <Button type="submit" className="w-full" loading={isSubmitting}>
              Log in
            </Button>
          </form>
          <p className="text-sm text-slate-600 text-center mt-2">Demo credentials: demo / demo</p>
        </Card>
      </div>
    </div>
  )
}
