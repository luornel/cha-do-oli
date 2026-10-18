-- Controle de acesso administrativo do Chá do Oli
-- Somente a conta com o e-mail confirmado abaixo pode ser administradora.
CREATE OR REPLACE FUNCTION public.sync_oli_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF lower(btrim(coalesce(NEW.email, ''))) = 'luaornelas@gmail.com'
     AND NEW.email_confirmed_at IS NOT NULL THEN
    INSERT INTO public.app_admins(user_id)
      VALUES (NEW.id)
      ON CONFLICT (user_id) DO NOTHING;
  ELSE
    DELETE FROM public.app_admins WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_oli_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_oli_admin_auth_change ON auth.users;
CREATE TRIGGER on_oli_admin_auth_change
  AFTER INSERT OR UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_oli_admin();

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.app_admins a
    JOIN auth.users u ON u.id = a.user_id
    WHERE a.user_id = (SELECT auth.uid())
      AND lower(btrim(u.email)) = 'luaornelas@gmail.com'
      AND u.email_confirmed_at IS NOT NULL
  )
$$;
REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;
