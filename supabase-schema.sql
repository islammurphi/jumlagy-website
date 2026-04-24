-- ============================================
-- نظام جملجي ERB - قاعدة البيانات الكاملة
-- ============================================

-- تفعيل الامتدادات
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. جدول المستخدمين (ممتد من auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. جدول خطط الاشتراك
-- ============================================
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL, -- 'تجريبي', 'شهري', 'سنوي'
  name_en TEXT,
  price DECIMAL NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL, -- 3, 30, 365
  max_repair_orders INTEGER, -- NULL = غير محدود
  is_active BOOLEAN DEFAULT true,
  features JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 3. جدول اشتراكات المستخدمين
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
  start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT DEFAULT 'نشط' CHECK (status IN ('نشط', 'منتهي', 'ملغي', 'تجريبي')),
  repair_orders_used INTEGER DEFAULT 0,
  auto_renew BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 4. جدول المصروفات
-- ============================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  amount DECIMAL NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  is_recurring BOOLEAN DEFAULT false,
  receipt_url TEXT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 5. جدول قطع الغيار
-- ============================================
CREATE TABLE IF NOT EXISTS public.spare_parts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT CHECK (category IN ('شاشات', 'بطاريات', 'شواحن', 'سماعات', 'كاميرات', 'أغطية', 'لوحات', 'أخرى')),
  purchase_price DECIMAL DEFAULT 0,
  selling_price DECIMAL DEFAULT 0,
  quantity INTEGER DEFAULT 0,
  min_quantity INTEGER DEFAULT 5,
  location TEXT,
  supplier TEXT,
  barcode TEXT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 6. جدول أوامر الصيانة
-- ============================================
CREATE TABLE IF NOT EXISTS public.repair_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_name TEXT NOT NULL,
  device_issue TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  received_by TEXT,
  technician TEXT,
  receive_date TIMESTAMP WITH TIME ZONE NOT NULL,
  delivery_date TIMESTAMP WITH TIME ZONE,
  repair_price DECIMAL DEFAULT 0,
  spare_parts_used JSONB DEFAULT '[]',
  technician_fee DECIMAL DEFAULT 0,
  status TEXT DEFAULT 'قيد_الصيانة' CHECK (status IN ('قيد_الصيانة', 'جاهز', 'تم_التسليم')),
  notes TEXT,
  device_images TEXT[] DEFAULT '{}',
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 7. جدول إعدادات المتجر
-- ============================================
CREATE TABLE IF NOT EXISTS public.shop_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_name TEXT DEFAULT 'جملجي ERB',
  owner_name TEXT,
  phone TEXT,
  address TEXT,
  language TEXT DEFAULT 'ar',
  warranty_days INTEGER DEFAULT 30,
  warranty_notes TEXT,
  shop_image TEXT,
  invoice_footer TEXT,
  technicians TEXT[] DEFAULT '{}',
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 8. جدول سجل النشاطات (للأدمن)
-- ============================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- تفعيل RLS (Row Level Security)
-- ============================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spare_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- سياسات RLS - المستخدم العادي يرى بياناته فقط
-- ============================================

-- المستخدمون: الجميع يقرأ، فقط الأدمن يعدل
CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT USING (auth.uid() = id OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- خطط الاشتراك: الجميع يقرأ، فقط الأدمن يعدل
CREATE POLICY "Anyone can read plans" ON public.subscription_plans
  FOR SELECT USING (true);

CREATE POLICY "Only admin can modify plans" ON public.subscription_plans
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- اشتراكات المستخدمين: يرى فقط اشتراكه، الأدمن يرى الكل
CREATE POLICY "Users can read own subscriptions" ON public.user_subscriptions
  FOR SELECT USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can insert own subscriptions" ON public.user_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- المصروفات
CREATE POLICY "Users can read own expenses" ON public.expenses
  FOR SELECT USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can insert own expenses" ON public.expenses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own expenses" ON public.expenses
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own expenses" ON public.expenses
  FOR DELETE USING (auth.uid() = user_id);

-- قطع الغيار
CREATE POLICY "Users can read own spare parts" ON public.spare_parts
  FOR SELECT USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can insert own spare parts" ON public.spare_parts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own spare parts" ON public.spare_parts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own spare parts" ON public.spare_parts
  FOR DELETE USING (auth.uid() = user_id);

-- أوامر الصيانة
CREATE POLICY "Users can read own repair orders" ON public.repair_orders
  FOR SELECT USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can insert own repair orders" ON public.repair_orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own repair orders" ON public.repair_orders
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own repair orders" ON public.repair_orders
  FOR DELETE USING (auth.uid() = user_id);

-- إعدادات المتجر (يوجد سجل واحد فقط لكل مستخدم)
CREATE POLICY "Users can read own shop settings" ON public.shop_settings
  FOR SELECT USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can insert own shop settings" ON public.shop_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own shop settings" ON public.shop_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- سجل النشاطات: فقط الأدمن يقرأ
CREATE POLICY "Only admin can read logs" ON public.activity_logs
  FOR SELECT USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- إدراج خطط الاشتراك الافتراضية
-- ============================================
INSERT INTO public.subscription_plans (name, name_en, price, duration_days, max_repair_orders, features) VALUES
('تجريبي', 'Trial', 0, 3, 3, '["3 أيام تجربة", "حد أقصى 3 أوامر صيانة", "دعم أساسي"]'::JSONB),
('شهري', 'Monthly', 99, 30, NULL, '["30 يوم", "أوامر صيانة غير محدودة", "دعم優先", "تقارير متقدمة"]'::JSONB),
('سنوي', 'Yearly', 499, 365, NULL, '["365 يوم", "أوامر صيانة غير محدودة", "دعم VIP", "تقارير متقدمة", "خصم 50%"]'::JSONB);

-- ============================================
-- دوال مساعدة
-- ============================================

-- تحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تطبيق التحديث التلقائي على الجداول
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_spare_parts_updated_at BEFORE UPDATE ON public.spare_parts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_repair_orders_updated_at BEFORE UPDATE ON public.repair_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_shop_settings_updated_at BEFORE UPDATE ON public.shop_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- دالة للتحقق من صلاحية الاشتراك
CREATE OR REPLACE FUNCTION check_subscription_validity(p_user_id UUID)
RETURNS TABLE (is_valid BOOLEAN, days_left INTEGER, plan_name TEXT, max_orders INTEGER, used_orders INTEGER) AS $$
DECLARE
  v_subscription RECORD;
  v_days_left INTEGER;
BEGIN
  SELECT us.*, sp.name as plan_name, sp.max_repair_orders INTO v_subscription
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id AND us.status = 'نشط'
  ORDER BY us.created_at DESC
  LIMIT 1;
  
  IF v_subscription IS NULL THEN
    RETURN QUERY SELECT false, 0, NULL::TEXT, 0, 0;
    RETURN;
  END IF;
  
  v_days_left := EXTRACT(DAY FROM (v_subscription.end_date - NOW()));
  
  IF v_days_left < 0 THEN
    UPDATE public.user_subscriptions SET status = 'منتهي' WHERE id = v_subscription.id;
    RETURN QUERY SELECT false, v_days_left, v_subscription.plan_name, v_subscription.max_repair_orders, v_subscription.repair_orders_used;
  ELSE
    RETURN QUERY SELECT true, v_days_left, v_subscription.plan_name, v_subscription.max_repair_orders, v_subscription.repair_orders_used;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;