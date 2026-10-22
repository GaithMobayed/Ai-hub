import * as z from 'zod';

// Mirrors the server rules for POST /auth/register (name 1–80, valid email, password ≥ 8)
export const LoginFormSchema = z
  .object({
    email: z.email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  })
  

export type LoginFormValues = z.infer<typeof LoginFormSchema>;
