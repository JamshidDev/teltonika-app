import { Configuration, Value } from '@itgorillaz/configify';

@Configuration()
export class JwtConfig {
  // Fallback yo'q — kalit bo'lmasa ilova ko'tarilmaydi.
  @Value('JWT_SECRET')
  secret!: string;

  @Value('JWT_EXPIRES_IN', { default: '7d' })
  expiresIn!: string;
}
