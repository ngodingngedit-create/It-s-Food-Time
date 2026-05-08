import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://pjypqnmoowowdeurfgal.supabase.co'
const SUPABASE_KEY = 'sb_publishable_itT5sWJdndQAsZodpYBK0A_spJ11vhS'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
