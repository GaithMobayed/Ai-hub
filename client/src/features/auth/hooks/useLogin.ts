import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/shared/stores/auth.store';
import { login } from '../api/auth';

export function useLogin() {
  return useMutation({
    mutationFn: login,
    onSuccess: ({ token, user }) => useAuthStore.getState().setSession(token, user),
  });
}
