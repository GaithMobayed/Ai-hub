import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router';
import { paths } from '@/shared/config/paths';
import { AuthLayout } from '../components/AuthLayout';
import { LoginForm } from '../components/login-form';

export function LoginPage () {
  return (
    <AuthLayout title="Create your account">
      <LoginForm />
      <Typography variant="body2" sx={{ textAlign: 'center' }}>
        don't have an account?{' '}
        <Link component={RouterLink} to={paths.register}>
          register now
        </Link>
      </Typography>
    </AuthLayout>
  );
}
