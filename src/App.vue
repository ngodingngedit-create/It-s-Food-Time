<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { db } from './firebase'
import { collection, addDoc, getDocs } from 'firebase/firestore'
import emailjs from '@emailjs/browser'
import { supabase } from './supabase'
import { formatPrice, translateStatus } from './utils/formatters'
import * as bcrypt from 'bcryptjs'

import AdminLogin from './views/admin/AdminLogin.vue'
import AdminDashboard from './views/admin/AdminDashboard.vue'


// --- State ---
const isAppLoading = ref(true)
const preventUnmount = ref(true)
const currentPage = ref('home')
const isCartOpen = ref(false)
const selectedFood = ref(null)
const tempQuantity = ref(1)
const activeMobileTab = ref('hero')

// Auth and Dashboard
const isLoggedIn = ref(false)
const currentUser = ref(null)
const loginForm = ref({
  email: '',
  password: ''
})
const isDashboardLoading = ref(false)

// New state for dynamic invoice
const invoiceData = ref(null)
const isInvoiceLoading = ref(false)



// Form states
const checkoutForm = ref({
  name: '',
  phone: '',
  email: '',
  address: '',
  pickupDate: new Date().toISOString().split('T')[0],
  pickupTime: '12:00',
  notes: '',
  paymentMethod: 'qris'
})
const orderId = ref('')

// --- Data ---
const menu = ref([])
const bundles = computed(() => {
  return menu.value.filter(item => item.name.toLowerCase().includes('paket') || item.name.toLowerCase().includes('hemat'))
})

const cart = ref([])

// --- Computeds ---
const filteredMenu = computed(() => {
  // Show popular items or all if none marked popular
  const popular = menu.value.filter(item => item.popular)
  return popular.length > 0 ? popular : menu.value
})

const cartTotal = computed(() => {
  return cart.value.reduce((total, item) => total + (item.price * item.quantity), 0)
})


// --- Methods ---

const openFoodDetail = (item) => {
  selectedFood.value = item
  tempQuantity.value = 1
}

const changeTempQuantity = (delta) => {
  if (tempQuantity.value + delta >= 1) {
    tempQuantity.value += delta
  }
}

const addSelectedToCart = () => {
  if (!selectedFood.value) return
  
  const existing = cart.value.find(i => i.id === selectedFood.value.id)
  if (existing) {
    existing.quantity += tempQuantity.value
  } else {
    cart.value.push({ ...selectedFood.value, quantity: tempQuantity.value })
  }
  selectedFood.value = null // close modal
}

const addDirectToCart = (item) => {

  const existing = cart.value.find(i => i.id === item.id)
  if (existing) {
    existing.quantity += 1
  } else {
    cart.value.push({ ...item, quantity: 1 })
  }
}

const updateQuantity = (item, delta) => {
  const existing = cart.value.find(i => i.id === item.id)
  if (existing) {
    existing.quantity += delta
    if (existing.quantity <= 0) {
      cart.value = cart.value.filter(i => i.id !== item.id)
    }
  }
}

const navigateTo = (page) => {
  currentPage.value = page
  isCartOpen.value = false
  window.scrollTo({ top: 0, behavior: 'smooth' })
  
  // Update URL manually for "pseudo-routing"
  const path = page === 'home' || page === 'hero' ? '/' : `/${page}`
  window.history.pushState(null, '', path)
}

const proceedToCheckout = () => {
  if (cart.value.length === 0) return
  navigateTo('checkout')
}

const processPayment = async () => {
  if (!checkoutForm.value.name || !checkoutForm.value.email || !checkoutForm.value.phone) {
    alert("Mohon lengkapi data pengiriman Anda.")
    return
  }
  
  isAppLoading.value = true // Show loader during process
  try {
    // 1. Save customer to table 'customers'
    const { data: customerData, error: customerError } = await supabase
      .from('customers')
      .insert([
        {
          full_name: checkoutForm.value.name,
          email: checkoutForm.value.email,
          phone: checkoutForm.value.phone,
          address: checkoutForm.value.address
        }
      ])
      .select()
      .single()

    if (customerError) throw customerError

    const customerId = customerData.id

    // 2. Generate invoice number
    const invoiceNumber = `INV-${Date.now()}`

    // 3. Save order to table 'orders'
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert([
        {
          invoice_number: invoiceNumber,
          customer_id: customerId,
          total_amount: cartTotal.value,
          payment_method: checkoutForm.value.paymentMethod,
          order_status: 'pending',
          pickup_date: checkoutForm.value.pickupDate,
          pickup_time: checkoutForm.value.pickupTime,
          notes: checkoutForm.value.notes
        }
      ])
      .select()
      .single()

    if (orderError) throw orderError

    const orderIdGenerated = orderData.id

    // 4. Save items to table 'order_items'
    const orderItems = cart.value.map(item => ({
      order_id: orderIdGenerated,
      product_id: item.id,
      qty: item.quantity,
      price: item.price,
      subtotal: item.price * item.quantity
    }))

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems)

    if (itemsError) throw itemsError

    // Finalize flow
    if (checkoutForm.value.paymentMethod === 'qris') {
      navigateTo('qris-payment')
    } else {
      const text = constructWhatsAppMessage()
      const phone = '6281296379040'
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      
      cart.value = []
      navigateTo('home')
      window.location.href = url
    }
  } catch (error) {
    console.error('Checkout error:', error)
    alert('Terjadi kesalahan saat memproses pesanan: ' + error.message)
  } finally {
    isAppLoading.value = false
  }
}

const constructWhatsAppMessage = (isFromInvoice = false) => {
  const data = isFromInvoice ? invoiceData.value : {
    customer_name: checkoutForm.value.name,
    items: cart.value,
    total: cartTotal.value,
    method: checkoutForm.value.paymentMethod
  }

  if (!data) return ''

  let text = `Halo!, IT's Food Time :\n`
  text += `Nama  : ${data.customer_name}\n`
  text += `Nomor Telp : ${checkoutForm.value.phone || '-'}\n`
  text += `alamat email : ${checkoutForm.value.email || '-'}\n`
  
  const items = isFromInvoice ? data.items : data.items
  items.forEach(item => {
    text += `Produk : ${item.name}\n`
    text += `Jumlah Pesanan: ${item.quantity}\n`
  })
  
  text += `Total: ${formatPrice(data.total)}\n`
  text += `Metode Pembayaran: ${data.method === 'qris' ? 'QRIS' : 'Bayar di Tempat (COD)'}\n\n`
  
  text += `Kirimkan bukti setelah pembayaran ya!\n`
  text += `Terima Kasih ❤️`
  
  return text
}

const sendWhatsAppOrder = () => {
  const text = constructWhatsAppMessage()
  const phone = '6281296379040'
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
  
  // Reset and go home before redirect
  cart.value = []
  navigateTo('home')
  
  // Redirect in same tab
  window.location.href = url
}

const processWhatsAppOrder = () => {
  const text = constructWhatsAppMessage(true)
  if (!text) return
  
  const phone = '6281296379040'
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
  window.location.href = url
}

const scrollToSection = (id) => {
  if (currentPage.value !== 'home') {
    currentPage.value = 'home'
    nextTick(() => {
      setTimeout(() => {
        const el = document.getElementById(id)
        if (el) el.scrollIntoView({ behavior: 'smooth' })
        activeMobileTab.value = id
      }, 300)
    })
  } else {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
    activeMobileTab.value = id
  }
}

// --- Coming Soon State ---
const isComingSoon = ref(false)
const countdownDate = new Date('2026-05-01T00:00:00').getTime()
const timeLeft = ref({
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0
})

const regForm = ref({
  name: '',
  email: ''
})
const isSubmitted = ref(false)

const updateCountdown = () => {
  const now = new Date().getTime()
  const distance = countdownDate - now
  
  if (distance < 0) {
    timeLeft.value = { days: 0, hours: 0, minutes: 0, seconds: 0 }
    return
  }
  
  timeLeft.value = {
    days: Math.floor(distance / (1000 * 60 * 60 * 24)),
    hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((distance % (1000 * 60)) / 1000)
  }
}

const submitRegistration = async () => {
  if (regForm.value.name && regForm.value.email) {
    try {
      // 1. Save to Firebase
      await addDoc(collection(db, "subscribers"), {
        name: regForm.value.name,
        email: regForm.value.email,
        subscribedAt: new Date().toISOString(),
        status: 'pending'
      });

      // 2. Send immediate confirmation via EmailJS (Optional)
      // Note: You need to set these IDs in your EmailJS account
      /*
      emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', {
        to_name: regForm.value.name,
        to_email: regForm.value.email,
      }, 'YOUR_PUBLIC_KEY');
      */

      console.log('Registration saved to Firebase:', regForm.value)
      isSubmitted.value = true
      
      setTimeout(() => {
        isSubmitted.value = false
        regForm.value = { name: '', email: '' }
      }, 3000)
    } catch (error) {
      console.error("Error saving subscriber:", error);
      alert("Maaf, terjadi kesalahan. Silakan coba lagi.");
    }
  }
}

// Function to notify all subscribers when site launches
// You can call this from the browser console: window.broadcastLaunch()
const broadcastLaunchNotification = async () => {
  const confirmLaunch = confirm("Apakah Anda yakin ingin mengirim notifikasi peluncuran ke SEMUA pelanggan?");
  if (!confirmLaunch) return;

  try {
    const querySnapshot = await getDocs(collection(db, "subscribers"));
    const subscribers = [];
    querySnapshot.forEach((doc) => {
      subscribers.push(doc.data());
    });

    console.log(`Sending notifications to ${subscribers.length} subscribers...`);
    
    // Iterate and send via EmailJS
    for (const sub of subscribers) {
      /*
      await emailjs.send('YOUR_SERVICE_ID', 'LAUNCH_TEMPLATE_ID', {
        to_name: sub.name,
        to_email: sub.email,
      }, 'YOUR_PUBLIC_KEY');
      */
      console.log(`Notified: ${sub.email}`);
    }

    alert(`Berhasil mengirim notifikasi ke ${subscribers.length} pelanggan!`);
  } catch (error) {
    console.error("Error broadcasting:", error);
  }
}

// Expose to window for manual trigger during dev
// Expose to window for manual trigger during dev
if (typeof window !== 'undefined') {
  window.broadcastLaunch = broadcastLaunchNotification;
}

// --- Supabase Methods ---
const fetchProducts = async () => {
  try {
    const { data, error } = await supabase.from('products').select('*')
    if (error) throw error

    // Map Supabase products to App structure
    menu.value = data.map(p => {
      let imageName = '/logo/logo1.png'
      const lowerName = (p.product_name || p.name || '').toLowerCase().replace(/\s/g, '')
      const cat = p.category ? p.category.toLowerCase() : ''
      
      if (p.image_url || p.img) {
        imageName = p.image_url || p.img
      } else {
        // Map category names to folder names
        let folder = ''
        if (cat.includes('bundling')) folder = 'bundling'
        else if (cat.includes('utama') || cat.includes('main')) folder = 'maincourse'
        else if (cat.includes('sidedish') || cat.includes('snack')) folder = 'snacks'
        else if (cat.includes('drink')) folder = 'drinks'

        // Specific overrides and filename handling
        let fileName = lowerName
        if (lowerName.includes('dimsum')) {
          folder = 'maincourse'
          fileName = 'dimsum'
        } else if (lowerName.includes('lemonade')) {
          folder = 'drinks'
          fileName = 'brazilianlemonade'
        } else if (lowerName.includes('ricebowl')) {
          folder = 'maincourse'
          fileName = 'ricebowl'
        } else if (lowerName.includes('jasuke')) {
          folder = 'snacks'
          fileName = 'jasuke'
        }

        if (folder) {
          imageName = `/${folder}/${fileName}.png`
        }
      }

      return {
        id: p.id || p.product_id,
        name: p.product_name || p.name,
        desc: p.description || p.desc,
        price: p.price,
        stock: p.stock_qty || p.stock || 0,
        variant: p.variant || '',
        popular: p.popular !== undefined ? p.popular : true,
        img: imageName
      }
    })
    
    // bundles now derived automatically via computed from menu
  } catch (error) {
    console.error('Error fetching products:', error)
  }
}

const handleLogin = async () => {
  const name = loginForm.value.email.trim() // Using email field as name
  const password = loginForm.value.password.trim()
  
  if (!name || !password) {
    alert('Mohon isi nama dan password.')
    return
  }
  
  isDashboardLoading.value = true
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('name', name)
      .single()
    
    if (error || !users) {
      console.log("Login Error:", error)
      alert('Nama atau kata sandi salah.')
      return
    }

    // Debugging logs
    console.log("User found:", users)
    console.log("DB Hash:", users.password_hash)

    try {
      // Compare password using bcrypt.compare()
      const isValid = await bcrypt.compare(password, users.password_hash)
      console.log("Is Valid:", isValid)

      if (isValid) {
        isLoggedIn.value = true
        currentUser.value = users
        
        // Simple session storage
        localStorage.setItem('food_time_session', JSON.stringify({
          isLoggedIn: true,
          user: users
        }))
        
        currentPage.value = 'dashboard'
        navigateTo('dashboard')
      } else {
        alert('Nama atau kata sandi salah.')
      }
    } catch (bcryptErr) {
      console.error('Bcrypt compare error:', bcryptErr)
      alert('Terjadi kesalahan pada enkripsi.')
    }
  } catch (error) {
    console.error('Login error:', error)
    alert('Terjadi kesalahan saat login: ' + (error.message || 'Cek koneksi atau database.'))
  } finally {
    isDashboardLoading.value = false
  }
}

const fetchInvoiceDetail = async (invNumber) => {
  if (!invNumber) return
  isInvoiceLoading.value = true
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        customers (*),
        order_items (
          *,
          products (*)
        )
      `)
      .eq('invoice_number', invNumber)
      .single()
    
    if (error) throw error

    if (data) {
      invoiceData.value = {
        id: data.invoice_number,
        date: new Date(data.created_at).toLocaleDateString(),
        method: data.payment_method,
        status: data.order_status,
        customer_name: data.customers?.full_name || 'Pelanggan',
        items: data.order_items.map(ti => ({
          name: ti.products?.product_name || 'Produk',
          quantity: ti.qty,
          price: ti.price,
          subtotal: ti.subtotal
        })),
        total: data.total_amount
      }
    }
  } catch (error) {
    console.error('Error fetching invoice:', error)
  } finally {
    isInvoiceLoading.value = false
  }
}

const handleLogout = () => {
  isLoggedIn.value = false
  currentUser.value = null
  localStorage.removeItem('food_time_session')
  navigateTo('home')
}

let countdownInterval = null


// --- Lifecycle & Scroll Tracking ---
let scrollObserver = null

const initScrollObserver = () => {
  if (scrollObserver) scrollObserver.disconnect()
  
  scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        activeMobileTab.value = entry.target.id
      }
    })
  }, { 
    threshold: [0.1, 0.3, 0.5],
    rootMargin: "-20% 0px -20% 0px" 
  })

  const sections = ['hero', 'menu', 'bundles']
  sections.forEach(id => {
    const el = document.getElementById(id)
    if (el) scrollObserver.observe(el)
  })
}

watch(currentPage, (newPage) => {
  if (newPage === 'home') {
    nextTick(() => {
      initScrollObserver()
    })
  } else {
    activeMobileTab.value = ''
  }
})

// Control overflow for Coming Soon
watch(isComingSoon, (val) => {
  if (val) {
    document.body.style.overflow = 'hidden'
    document.body.style.height = '100vh'
  } else {
    document.body.style.overflow = ''
    document.body.style.height = ''
  }
}, { immediate: true })

onMounted(() => {
  updateCountdown()
  countdownInterval = setInterval(updateCountdown, 1000)
  
  fetchProducts()
  
  // Check session
  const savedSession = localStorage.getItem('food_time_session')
  if (savedSession) {
    try {
      const session = JSON.parse(savedSession)
      if (session.isLoggedIn && session.user) {
        isLoggedIn.value = true
        currentUser.value = session.user
      }
    } catch (e) {
      localStorage.removeItem('food_time_session')
    }
  }

  // Handle routes based on URL path
  const path = window.location.pathname
  const params = new URLSearchParams(window.location.search)
  const orderIdFromUrl = params.get('order_id')

  if (path === '/login-admin') {
    currentPage.value = 'login'
  } else if (path === '/dashboard') {
    if (!isLoggedIn.value) {
      currentPage.value = 'login'
    } else {
      currentPage.value = 'dashboard'
    }
  } else if (path === '/invoice') {
    currentPage.value = 'invoice'
    if (orderIdFromUrl) {
      orderId.value = orderIdFromUrl
      fetchInvoiceDetail(orderIdFromUrl)
    }
  } else if (path === '/all-menu') {
    currentPage.value = 'all-menu'
  }
  
  setTimeout(() => {
    isAppLoading.value = false
    setTimeout(() => {
      preventUnmount.value = false
      if (currentPage.value === 'home' && !isComingSoon.value) {
        initScrollObserver()
      }
    }, 100) 
  }, 2300)
})
</script>

<template>
  <div>
    <!-- ENTRY ANIMATION LOADING SCREEN -->
    <div class="modern-loader" :class="{ 'slide-up-exit': !isAppLoading }" v-if="preventUnmount">
      <div class="loader-content">
        <div class="loader-text-mask">
          <img src="/logo/logo1.png" alt="IT's Food Time Logo" class="loader-logo" />
        </div>
        <div class="loader-line-wrapper">
          <div class="loader-line"></div>
        </div>
      </div>
    </div>

    <!-- MAIN APP CONTENT (Fade up entry logic handled securely) -->
    <div class="app-container" :class="{ 'mounted': !isAppLoading }" v-show="!preventUnmount || !isAppLoading">
      
      <!-- HEADER -->
      <header class="header" :class="{ 'coming-soon-header': isComingSoon }">
        <div class="container header-grid" v-if="!isComingSoon">
          <!-- Logo -->
          <div class="header-left">
            <a href="#" class="logo" @click.prevent="navigateTo('home')">
              <img src="/logo/logo1.png" alt="Logo" class="logo-img" />
            </a>
          </div>
          
          <div class="header-center hidden-mobile">
            <nav class="desktop-nav">
              <a href="#" @click.prevent="navigateTo('home')" class="nav-link">Beranda</a>
              <a href="#" @click.prevent="navigateTo('all-menu')" class="nav-link">Menu</a>
              <a href="#bundles" @click.prevent="scrollToSection('bundles')" class="nav-link">Paket Hemat</a>
            </nav>
          </div>
          
          <!-- Action Buttons -->
          <div class="header-right">
            <button class="cart-btn" @click="navigateTo('cart')" v-if="!isLoggedIn && !isComingSoon">
              <span class="cart-label hidden-mobile">Keranjang</span>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
              <div class="cart-badge" v-if="cart.length > 0">{{ cart.length }}</div>
            </button>
            <!-- Login Button Hidden (Access via /login-admin), visible only if logged in -->
            <button class="user-btn" @click="navigateTo('dashboard')" v-if="isLoggedIn && !isComingSoon" title="Dashboard">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </button> 
          </div>
        </div>
        
        <!-- Centered Logo for Coming Soon -->
        <div class="container cs-header-centered" v-else>
          <img src="/logo/logo1.png" alt="Logo" class="logo-img" />
        </div>
      </header>

      <!-- MOBILE BOTTOM NAVIGATION -->
      <nav class="mobile-bottom-nav" v-if="!isComingSoon">
        <!-- Home Section -->
        <a href="#hero" class="mobile-nav-item" @click.prevent="scrollToSection('hero')" :class="{ active: activeMobileTab === 'hero' && currentPage === 'home' }">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </a>
        <!-- Signatures / Bundles (Bowl icon) -->
        <a href="#bundles" class="mobile-nav-item" @click.prevent="scrollToSection('bundles')" :class="{ active: (activeMobileTab === 'menu' || activeMobileTab === 'bundles' || currentPage === 'all-menu') && currentPage !== 'cart' }">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18a2 2 0 0 1 2 2v1h-3a4 4 0 0 1-8 0H1v-1a2 2 0 0 1 2-2z"/><path d="M12 13a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z"/></svg>
        </a>
        <!-- Cart -->
        <a href="#" class="mobile-nav-item" @click.prevent="navigateTo('cart')" :class="{ active: currentPage === 'cart' }">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          <div class="cart-badge-mini" v-if="cart.length > 0">{{ cart.length }}</div>
        </a>
      </nav>

      <main :class="{ 'coming-soon-active': isComingSoon }">
        <!-- ==================== PAGE: COMING SOON ==================== -->
        <div v-if="isComingSoon" class="coming-soon-container">
          <!-- Background and Characters Layered properly -->
          <div class="cs-background">
            <div class="cs-circle circle-1"></div>
            <div class="cs-circle circle-2"></div>
            <div class="cs-circle circle-3"></div>
          </div>
          
          <div class="cs-characters">
            <img src="/karakter/karakter.png" alt="Character 1" class="cs-char cs-char-1" />
            <img src="/karakter/karakter (2).png" alt="Character 2" class="cs-char cs-char-2" />
          </div>

          <!-- Top Marquee (Under Header) -->
          <div class="marquee-divider cs-top-marquee">
            <div class="marquee-track smooth">
              <span v-for="n in 15" :key="n">SEGERA HADIR </span>
            </div>
          </div>

          <div class="container cs-content">
            <div class="cs-text-section">
              <!-- <div class="cs-badge">Coming Soon</div> -->
              <h1 class="cs-title">Sesuatu yang Lezat <br/><span>Sedang Disiapkan!</span></h1>
              <p class="cs-subtitle">
                Kami sedang menyiapkan pengalaman kuliner terbaik untuk masa depan Anda. 
                Tunggu kehadiran kami sebentar lagi!
              </p>

              <!-- Countdown -->
              <div class="cs-countdown">
                <div class="countdown-item">
                  <span class="number">{{ timeLeft.days || 0 }}</span>
                  <span class="label">Hari</span>
                </div>
                <div class="countdown-item">
                  <span class="number">{{ timeLeft.hours || 0 }}</span>
                  <span class="label">Jam</span>
                </div>
                <div class="countdown-item">
                  <span class="number">{{ timeLeft.minutes || 0 }}</span>
                  <span class="label">Menit</span>
                </div>
                <div class="countdown-item">
                  <span class="number">{{ timeLeft.seconds || 0 }}</span>
                  <span class="label">Detik</span>
                </div>
              </div>

              <!-- Registration Form -->
              <div class="cs-form-container">
                <div v-if="!isSubmitted" class="cs-form-wrapper">
                  <h3>Dapatkan Notifikasi Saat Kami Meluncur</h3>
                  <form @submit.prevent="submitRegistration" class="cs-form">
                    <input type="text" v-model="regForm.name" placeholder="Nama Anda" required />
                    <input type="email" v-model="regForm.email" placeholder="Alamat Email Anda" required />
                    <button type="submit" class="btn btn-primary cs-submit-btn">Beri Tahu Saya</button>
                  </form>
                </div>
                <div v-else class="cs-success-msg">
                  <div class="success-icon">✨</div>
                  <h3>Terima kasih!</h3>
                  <p>Kami akan mengirimkan notifikasi ke email Anda.</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Bottom Marquee Loop -->
          <!-- <div class="marquee-divider cs-bottom-marquee">
            <div class="marquee-track smooth">
              <span v-for="n in 15" :key="n">COMING SOON ✦ </span>
            </div>
          </div> -->
        </div>

        <!-- ==================== PAGE: HOME ==================== -->
        <div v-if="currentPage === 'home' && !isComingSoon">
          
          <!-- Hero Section: Full Landscape with AI Restaurant Scene -->
          <section id="hero" class="hero-full">
            <div class="hero-overlay">
              <div class="container hero-content-centered">
                <h1>Kumpul & Makan dengan Ceria,<br/><span class="text-primary">Serasa di Rumah!</span></h1>
                <p>Bosan dengan makanan kampus? IT's Food Time menghadirkan makanan segar, hangat, dan lezat untuk kumpul santai.</p>
                <div class="hero-actions">
                  <a href="#menu" class="btn btn-primary">Pesan Sekarang</a>
                </div>
              </div>
            </div>
          </section>

          <!-- Divider Marquee 1 (Smoother) -->
          <div class="marquee-divider">
            <div class="marquee-track smooth">
              <span v-for="n in 20" :key="n">IT's Food Time ✦ </span>
            </div>
          </div>

          <!-- Menu Section -->
          <section id="menu" class="menu-section">
            <div class="container">
              <div class="section-header">
                <h2>Lagi Ngidam Sesuatu?</h2>
                <p>Pilih dari menu andalan kami yang baru dibuat</p>
              </div>
              

              <div class="menu-grid">
                <div class="menu-card" v-for="item in filteredMenu" :key="item.id" @click="openFoodDetail(item)">
                  <div class="card-img-wrapper">
                    <span class="popular-badge" v-if="item.popular">Populer</span>
                    <img :src="item.img" :alt="item.name" loading="lazy" />
                  </div>
                  <div class="card-content">
                    <div class="card-title">{{ item.name }}</div>
                    <div class="card-desc">{{ item.desc }}</div>
                    <div class="card-footer">
                      <span class="price">{{ formatPrice(item.price) }}</span>
                      <button class="add-btn" @click.stop="addDirectToCart(item)">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- See All Menu Button - Only visible when "All" (Popular) active -->
              <div class="see-all-container">
                <button class="btn btn-outline see-all-btn" @click="navigateTo('all-menu')">
                  Lihat Semua Menu
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              </div>
            </div>
          </section>

          <!-- Divider Marquee 2 (Smoother) -->
          <div class="marquee-divider alternate">
            <div class="marquee-track smooth reverse">
              <span v-for="n in 20" :key="n">IT's Food Time ✦ </span>
            </div>
          </div>

          <!-- Bundles Section -->
          <section id="bundles" class="bundles-section">
            <div class="container">
              <div class="section-header">
                <h2>Paket Hemat Terbaik</h2>
                <p>Hemat lebih banyak dengan kombo spesial kami!</p>
              </div>
              <div class="bundles-grid">
                <div class="bundle-card" v-for="bundle in bundles" :key="bundle.id" @click="openFoodDetail(bundle)">
                  <div class="bundle-img-wrapper">
                    <img :src="bundle.img" :alt="bundle.name" class="bundle-img"/>
                  </div>
                  <div class="bundle-content">
                    <div class="bundle-info">
                      <h3>{{ bundle.name }}</h3>
                      <p>{{ bundle.desc }}</p>
                      <div class="price-row">
                        <span class="price">{{ formatPrice(bundle.price) }}</span>
                      </div>
                    </div>
                    <button class="btn btn-primary bundle-btn" @click.stop="openFoodDetail(bundle)">
                      Lihat Detail
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- ==================== PAGE: CART ==================== -->
        <div class="page-container" v-else-if="currentPage === 'cart'">
          <div class="container page-content">
            <div class="page-header">
              <button class="back-btn" @click="navigateTo('home')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                Kembali ke Menu
              </button>
              <h2>Keranjang Anda 🛒</h2>
            </div>
            
            <div v-if="cart.length > 0" class="cart-layout">
              <!-- Cart items and summary details -->
              <div class="cart-items-list">
                <div class="cart-item-card" v-for="item in cart" :key="item.id">
                  <div class="cart-item-img-wrapper">
                    <img :src="item.img" :alt="item.name" />
                  </div>
                  <div class="item-details">
                    <h4>{{ item.name }}</h4>
                    <p class="item-desc-cart">{{ item.desc }}</p>
                    <p class="item-price">{{ formatPrice(item.price) }}</p>
                  </div>
                  <div class="cart-item-actions">
                    <div class="qty-controls-modern">
                      <button @click="updateQuantity(item, -1)" aria-label="Decrease quantity">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      </button>
                      <span>{{ item.quantity }}</span>
                      <button @click="updateQuantity(item, 1)" aria-label="Increase quantity">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      </button>
                    </div>
                    <button class="delete-btn-modern" @click="updateQuantity(item, -item.quantity)" aria-label="Remove item">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
              </div>
              <div class="cart-summary-card">
                <h3>Ringkasan Pesanan</h3>
                <div class="summary-row">
                  <span>Subtotal ({{ cart.length }} items)</span>
                  <span>{{ formatPrice(cartTotal) }}</span>
                </div>
                <div class="summary-row total">
                  <span>Total</span>
                  <span class="total-amount-large">{{ formatPrice(cartTotal) }}</span>
                </div>
                <button class="btn btn-primary w-full checkout-btn" @click="proceedToCheckout">Lanjut ke Pembayaran</button>
              </div>
            </div>
            <div v-else class="empty-state">
              <div class="empty-icon">🍟</div>
              <h3>Keranjang Anda kosong</h3>
              <p>Sepertinya Anda belum menambahkan apa pun ke keranjang.</p>
              <button class="btn btn-primary" @click="navigateTo('home')">Lihat Menu</button>
            </div>
          </div>
        </div>

        <!-- ==================== PAGE: CHECKOUT ==================== -->
        <div class="page-container" v-else-if="currentPage === 'checkout'">
          <div class="container page-content">
            <div class="page-header">
              <button class="back-btn" @click="navigateTo('cart')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                Kembali ke Keranjang
              </button>
              <h2>Pembayaran 💳</h2>
            </div>
            <div class="checkout-layout">
              <div class="checkout-form">
                <div class="form-section">
                  <div class="checkout-title-with-icon">
                    <span class="icon-circle">📍</span>
                    <h3>Detail Pengiriman</h3>
                  </div>
                  <div class="form-group">
                    <label>Nama Lengkap</label>
                    <input type="text" v-model="checkoutForm.name" placeholder="John Doe" required />
                  </div>
                  <div class="form-group">
                    <label>Nomor Telepon</label>
                    <input type="tel" v-model="checkoutForm.phone" placeholder="0812xxxxxx" required />
                  </div>
                  <div class="form-group">
                    <label>Alamat Email</label>
                    <input type="email" v-model="checkoutForm.email" placeholder="john@example.com" required />
                  </div>
                  <div class="form-group">
                    <label>Alamat Pengiriman / Detail Lokasi</label>
                    <textarea v-model="checkoutForm.address" placeholder="Jl. Raya No. 123..." rows="2" required></textarea>
                  </div>
                </div>

                <div class="form-section mt-4">
                  <div class="checkout-title-with-icon">
                    <span class="icon-circle">⏰</span>
                    <h3>Waktu Penjemputan</h3>
                  </div>
                  <div class="form-grid-2">
                    <div class="form-group">
                      <label>Tanggal</label>
                      <input type="date" v-model="checkoutForm.pickupDate" required />
                    </div>
                    <div class="form-group">
                      <label>Jam</label>
                      <input type="time" v-model="checkoutForm.pickupTime" required />
                    </div>
                  </div>
                  <div class="form-group">
                    <label>Catatan Pesanan (Opsional)</label>
                    <input type="text" v-model="checkoutForm.notes" placeholder="Contoh: Sambal dipisah, dll." />
                  </div>
                </div>
                <div class="form-section mt-4">
                  <div class="checkout-title-with-icon">
                    <span class="icon-circle">💳</span>
                    <h3>Metode Pembayaran</h3>
                  </div>
                  <div class="payment-options">
                    <label class="payment-card" :class="{ selected: checkoutForm.paymentMethod === 'qris' }">
                      <input type="radio" value="qris" v-model="checkoutForm.paymentMethod">
                      <div class="payment-info"><strong>QRIS</strong><span>Scan dengan E-Wallet apa pun</span></div>
                    </label>
                    <label class="payment-card" :class="{ selected: checkoutForm.paymentMethod === 'cash' }">
                      <input type="radio" value="cash" v-model="checkoutForm.paymentMethod">
                      <div class="payment-info"><strong>Bayar di Tempat (COD)</strong><span>Bayar saat makanan sampai</span></div>
                    </label>
                  </div>
                  <!-- Note: QRIS image removed from here as per new flow to use a dedicated page -->
                </div>
              </div>
              <div class="cart-summary-card">
                <h3>Ringkasan Akhir</h3>
                <div class="summary-list">
                  <div class="summary-row text-sm text-gray" v-for="item in cart" :key="item.id">
                    <span>{{ item.quantity }}x {{ item.name }}</span>
                    <span>{{ formatPrice(item.price * item.quantity) }}</span>
                  </div>
                </div>
                <hr class="summary-divider" />
                <div class="summary-row total">
                  <span>Total Keseluruhan</span>
                  <span class="total-amount-large">{{ formatPrice(cartTotal) }}</span>
                </div>
                <button class="btn btn-primary w-full pay-btn" @click="processPayment">Selesaikan Pembayaran</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ==================== PAGE: INVOICE ==================== -->
        <div class="page-container" v-else-if="currentPage === 'invoice'">
          <div class="container invoice-content">
            <div v-if="isInvoiceLoading" class="invoice-loading-state">
              <div class="spinner"></div>
              <p>Mengambil detail pesanan Anda...</p>
            </div>
            <div v-else-if="invoiceData" class="invoice-card">
              <div class="success-icon">✓</div>
              <h2>Pesanan Dikonfirmasi!</h2>
              <p class="invoice-subtitle">Terima kasih telah memesan di IT's Food Time</p>
              <div class="invoice-details">
                <div class="invoice-row"><span class="label">ID Pesanan:</span><span class="value order-id">{{ invoiceData.id }}</span></div>
                <div class="invoice-row"><span class="label">Tanggal:</span><span class="value">{{ invoiceData.date }}</span></div>
                <div class="invoice-row"><span class="label">Status:</span><span class="value capitalize" :class="invoiceData.status">{{ translateStatus(invoiceData.status) }}</span></div>
                <div class="invoice-row"><span class="label">Metode Pembayaran:</span><span class="value capitalize">{{ invoiceData.method }}</span></div>
              </div>

              <!-- QRIS Display for Invoice -->
              <div v-show="invoiceData.method === 'qris'" 
                   style="margin-top: 20px; padding: 20px; background-color: #f0f9ff; border: 2px dashed #3b82f6; border-radius: 12px; text-align: center;">
                <p style="margin-bottom: 10px; font-weight: bold; color: #1e40af;">Silakan scan QRIS untuk menyelesaikan pembayaran:</p>
                <img src="/QRIS.jpeg" alt="QRIS" style="max-width: 250px; width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />
              </div>

              <div class="invoice-items">
                <h4>Item yang Dipesan</h4>
                <div class="summary-row text-sm" v-for="item in invoiceData.items" :key="item.name">
                  <span>{{ item.quantity }}x {{ item.name }}</span>
                  <span>{{ formatPrice(item.price * item.quantity) }}</span>
                </div>
                <hr class="summary-divider mt-3" />
                <div class="summary-row total">
                  <span>Total Dibayar</span>
                  <span>{{ formatPrice(invoiceData.total) }}</span>
                </div>
              </div>
              <div class="invoice-actions">
                <button class="btn btn-primary wa-btn w-full" @click="processWhatsAppOrder">
                  Kirim Invoice via WhatsApp
                </button>
                <button class="btn btn-outline w-full mt-3" @click="navigateTo('home'); invoiceData=null; cart=[]">Kembali ke Beranda</button>
              </div>
            </div>
            <div v-else class="invoice-card error-state">
              <div class="error-icon">❌</div>
              <h2>Invoice Tidak Ditemukan</h2>
              <p>Kami tidak dapat menemukan detail untuk pesanan <strong>{{ orderId }}</strong>.</p>
              <button class="btn btn-primary mt-4" @click="navigateTo('home')">Kembali ke Menu</button>
            </div>
          </div>
        </div>

        <!-- ==================== PAGE: QRIS PAYMENT (Full Page) ==================== -->
        <div class="page-container" v-else-if="currentPage === 'qris-payment'">
          <div class="container qris-payment-page animate-fade-up">
            <div class="qris-payment-card">
              <div class="qris-header">
                <h2>Pembayaran QRIS 📱</h2>
                <p>Silakan selesaikan pembayaran Anda dengan scan kode di bawah</p>
              </div>
              
              <div class="qris-main-display">
                <div class="qris-large-wrapper">
                  <img src="/QRIS.jpeg" alt="QRIS Code" class="qris-full-img" />
                </div>
                <div class="payment-instructions">
                  <ol>
                    <li>Buka aplikasi e-wallet (GoPay, OVO, Dana, LinkAja) atau Mobile Banking Anda.</li>
                    <li>Pilih fitur <strong>Scan / Bayar</strong>.</li>
                    <li>Scan kode QR di atas atau unggah dari galeri.</li>
                    <li>Masukkan nominal: <strong>{{ formatPrice(cartTotal) }}</strong></li>
                    <li>Selesaikan pembayaran dan simpan buktinya.</li>
                  </ol>
                </div>
              </div>

              <div class="qris-actions">
                <button class="btn btn-primary wa-confirm-btn" @click="sendWhatsAppOrder">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Kirim Bukti via WhatsApp
                </button>
                <button class="btn btn-outline w-full" @click="navigateTo('home')">Kembali ke Beranda</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ==================== PAGE: ALL MENU (Categorized) ==================== -->
        <div class="page-container" v-else-if="currentPage === 'all-menu'">
          <div class="container page-content">
            <div class="page-header center-header">
              <button class="back-btn" @click="navigateTo('home')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                Kembali ke Beranda
              </button>
              <h2>Jelajahi Menu Lengkap Kami</h2>
              <p>Pilihan Hidangan Utama, Camilan, dan Minuman</p>
            </div>

            <div class="menu-grid">
              <div class="menu-card" v-for="item in menu" :key="item.id" @click="openFoodDetail(item)">
                <div class="card-img-wrapper">
                  <span class="popular-badge" v-if="item.popular">Populer</span>
                  <img :src="item.img" :alt="item.name" loading="lazy" />
                </div>
                <div class="card-content">
                  <div class="card-title">{{ item.name }}</div>
                  <div class="card-desc">{{ item.desc }}</div>
                  <div class="card-footer">
                    <span class="price">{{ formatPrice(item.price) }}</span>
                    <button class="add-btn" @click.stop="addDirectToCart(item)">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ==================== PAGE: LOGIN ==================== -->
        <AdminLogin 
          v-else-if="currentPage === 'login'" 
          :loginForm="loginForm"
          :isDashboardLoading="isDashboardLoading"
          @login="handleLogin"
          @navigate="navigateTo"
        />

        <!-- ==================== PAGE: DASHBOARD ==================== -->
        <AdminDashboard
          v-else-if="currentPage === 'dashboard'"
          :currentUser="currentUser"
          :menu="menu"
          @logout="handleLogout"
          @refresh-products="fetchProducts"
        />


      </main>

      <!-- DETAIL MODAL OVERLAY -->
      <div class="modal-overlay" :class="{ 'fade-in': selectedFood }" v-if="selectedFood" @click.self="selectedFood = null">
        <div class="food-detail-modal">
          <button class="close-modal" @click="selectedFood = null">×</button>
          <div class="modal-img-wrapper">
            <img :src="selectedFood.img" :alt="selectedFood.name" />
          </div>
          <div class="modal-content">
            <h2>{{ selectedFood.name }}</h2>
            <p class="modal-desc">{{ selectedFood.desc }}</p>
            <div class="modal-action-area">
              <span class="modal-price">{{ formatPrice(selectedFood.price) }}</span>
              <div class="qty-control-huge">
                <button @click="changeTempQuantity(-1)">-</button>
                <span class="qty-num">{{ tempQuantity }}</span>
                <button @click="changeTempQuantity(1)">+</button>
              </div>
            </div>
            <button class="btn btn-primary w-full add-to-cart-big" @click="addSelectedToCart">
              Tambah ke Keranjang - {{ formatPrice(selectedFood.price * tempQuantity) }}
            </button>
          </div>
        </div>
      </div>

      <!-- EDIT PRODUCT MODAL MOVED TO AdminDashboard.vue -->

    </div>
  </div>
</template>

<style scoped>
/* App Container Base */
.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  opacity: 0;
  transition: opacity 0.8s ease-out;
}
.app-container.mounted {
  opacity: 1;
}

/* NEW ADDITIONS FOR LOGIN & DASHBOARD */
.login-content {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 80vh;
}
.login-card {
  background: white;
  padding: 3rem;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  width: 100%;
  max-width: 450px;
  border: 1px solid var(--border);
}
.login-header-section {
  text-align: center;
  margin-bottom: 2.5rem;
}
.login-form-ui .form-group {
  margin-bottom: 1.5rem;
}
.login-form-ui label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: var(--text-dark);
}
.login-form-ui input {
  width: 100%;
  padding: 0.8rem 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  font-size: 1rem;
  transition: border-color 0.2s;
}
.login-form-ui input:focus {
  outline: none;
  border-color: var(--primary);
}

.dashboard-content {
  padding-top: 3rem;
  padding-bottom: 5rem;
}
.dashboard-header-ui {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 3rem;
  flex-wrap: wrap;
  gap: 1.5rem;
}
.dashboard-header-actions {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}
.dashboard-tabs {
  display: flex;
  background: #f1f5f9;
  padding: 0.4rem;
  border-radius: var(--radius-md);
  gap: 0.25rem;
}
.tab-btn {
  padding: 0.6rem 1.2rem;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--text-light);
  transition: all 0.2s;
}
.tab-btn.active {
  background: white;
  color: var(--primary);
  box-shadow: var(--shadow-sm);
}

/* Manage Products Styles */
.product-cell {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.mini-thumb {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: var(--radius-sm);
}
.badge-cat {
  background: #f1f5f9;
  color: #64748b;
  padding: 0.2rem 0.6rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
}
.action-btns-list {
  display: flex;
  gap: 0.5rem;
}
.btn-icon-small {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: white;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-icon-small.edit:hover { background: #eff6ff; border-color: #3b82f6; color: #3b82f6; }
.btn-icon-small.delete:hover { background: #fef2f2; border-color: #ef4444; color: #ef4444; }

.btn-outline-sm {
  padding: 0.4rem 1rem;
  font-size: 0.8rem;
  border: 1px solid var(--border);
  background: white;
  border-radius: var(--radius-sm);
}
.btn-danger-sm {
  padding: 0.4rem 1rem;
  font-size: 0.8rem;
  border: 1px solid #fee2e2;
  background: #fef2f2;
  color: #ef4444;
  border-radius: var(--radius-sm);
}

/* Edit Modal */
.edit-modal-card {
  background: white;
  width: 90%;
  max-width: 600px;
  padding: 2.5rem;
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 50px rgba(0,0,0,0.1);
  position: relative;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}
.checkbox-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}
.checkbox-group input {
  width: 18px;
  height: 18px;
}


/* QRIS UI */

.qris-container {
  margin-top: 1.5rem;
  padding: 1.5rem;
  background: #f8fafc;
  border-radius: var(--radius-lg);
  border: 1px dashed var(--border);
  text-align: center;
}
.qris-instruction {
  font-size: 0.9rem;
  color: var(--text-light);
  margin-bottom: 1rem;
  font-weight: 500;
}
.qris-image-wrapper {
  background: white;
  padding: 1rem;
  border-radius: var(--radius-md);
  display: inline-block;
  box-shadow: var(--shadow-sm);
}
.qris-checkout-img {
  max-width: 200px;
  width: 100%;
  height: auto;
  border-radius: 4px;
}

/* QRIS Payment Page Styles */
.qris-payment-page {
  padding-top: 3rem;
  padding-bottom: 5rem;
  display: flex;
  justify-content: center;
}
.qris-payment-card {
  background: white;
  padding: 3rem;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  max-width: 700px;
  width: 100%;
  text-align: center;
  border: 1px solid var(--border);
}
.qris-header h2 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}
.qris-header p {
  color: var(--text-light);
  margin-bottom: 2.5rem;
}
.qris-main-display {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2.5rem;
  align-items: center;
  margin-bottom: 3rem;
  text-align: left;
}
.qris-large-wrapper {
  background: white;
  padding: 1.5rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}
.qris-full-img {
  width: 100%;
  height: auto;
  display: block;
}
.payment-instructions ol {
  padding-left: 1.25rem;
  color: var(--text-dark);
}
.payment-instructions li {
  margin-bottom: 0.75rem;
  font-size: 0.95rem;
  line-height: 1.6;
}
.qris-actions {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.wa-confirm-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1.2rem;
  font-size: 1.1rem;
  font-weight: 700;
}

@media (max-width: 600px) {
  .qris-main-display {
    grid-template-columns: 1fr;
    text-align: center;
  }
  .qris-payment-card {
    padding: 2rem 1.5rem;
  }
}

.no-scroll {

  overflow: hidden;
  height: 100vh;
}
.text-primary {
  color: var(--primary);
}

/* ================= MODERN LOADER LOGO ================= */
.modern-loader {
  position: fixed;
  inset: 0;
  background: white;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.8s cubic-bezier(0.85, 0, 0.15, 1);
}
.slide-up-exit {
  transform: translateY(-100%);
}
.loader-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}
.loader-text-mask {
  overflow: hidden;
  display: inline-block;
  padding: 10px 0;
}
.loader-logo {
  height: 240px;
  width: auto;
  object-fit: contain;
  transform: translateY(110%);
  animation: revealText 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards;
}
.loader-line-wrapper {
  width: 140px;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
  opacity: 0;
  animation: fadeIn 0.4s ease 1s forwards;
}
.loader-line {
  width: 0%;
  height: 100%;
  background: var(--primary);
  border-radius: 2px;
  animation: fillLine 1s cubic-bezier(0.16, 1, 0.3, 1) 1.2s forwards;
}

@keyframes revealText {
  0% { transform: translateY(110%); }
  100% { transform: translateY(0); }
}
@keyframes fillLine {
  0% { width: 0%; }
  100% { width: 100%; }
}


/* ================= HEADER & NAV (Centered layout) ================= */
.header {
  position: sticky;
  top: 0;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(15px);
  z-index: 50;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  padding-bottom: 1.25rem;
}
.header-grid {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  height: var(--header-height);
}
.header-left {
  display: flex;
  justify-content: flex-start;
}
.header-center {
  display: flex;
  justify-content: center;
}
.header-right {
  display: flex;
  justify-content: flex-end;
}
.logo {
  display: flex;
  align-items: center;
}
.logo-img {
  height: 100px;
  width: auto;
  object-fit: contain;
}
.desktop-nav {
  display: flex;
  gap: 3rem;
  background: rgba(226, 232, 240, 0.3);
  padding: 0.5rem 1.5rem;
  border-radius: var(--radius-full);
}
.user-btn {
  background: white;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  color: var(--text-dark);
  border: 1px solid rgba(0,0,0,0.05);
  transition: all 0.3s;
}
.user-btn:hover {
  background: var(--primary);
  color: white;
  transform: scale(1.05);
}

.nav-link {
  font-weight: 600;
  color: var(--text-light);
  transition: color 0.2s;
}
.nav-link:hover {
  color: var(--primary);
}
.cart-btn {
  position: relative;
  background: white;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 1.25rem;
  border-radius: var(--radius-full);
  color: var(--text-dark);
  font-weight: 600;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 15px rgba(0,0,0,0.03);
  border: 1px solid rgba(0,0,0,0.05);
}
.cart-btn:hover {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
  transform: translateY(-2px);
  box-shadow: var(--shadow-primary);
}
.cart-badge {
  background: var(--text-dark);
  color: white;
  font-size: 0.75rem;
  font-weight: bold;
  height: 22px;
  min-width: 22px;
  padding: 0 6px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cart-btn:hover .cart-badge {
  background: white;
  color: var(--primary);
}


/* ================= HERO (LANDSCAPE BACKGROUND) ================= */
.hero-full {
  width: 100%;
  height: 85vh;
  min-height: 500px;
  display: flex;
  background-image: url('/situasi.png');
  background-size: cover;
  background-position: center;
  position: relative;
  overflow: hidden;
  animation: heroZoom 15s ease-in-out infinite alternate;
}

.hero-full::before, .hero-full::after {
  content: '';
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  z-index: 0;
  opacity: 0;
}

.hero-full::before {
  background-image: url('/situasi2.png');
  animation: crossfade2 15s infinite;
}

.hero-full::after {
  background-image: url('/situasi3.png');
  animation: crossfade3 15s infinite;
}

@keyframes heroZoom {
  0% { transform: scale(1); }
  100% { transform: scale(1.05); }
}

@keyframes crossfade2 {
  0%, 25% { opacity: 0; }
  33%, 58% { opacity: 1; }
  66%, 100% { opacity: 0; }
}

@keyframes crossfade3 {
  0%, 58% { opacity: 0; }
  66%, 91% { opacity: 1; }
  100% { opacity: 0; }
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, rgba(26, 30, 41, 0.4) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}
.hero-content-centered {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  max-width: 800px;
}
.hero-content-centered h1 {
  font-size: 4.5rem;
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin-bottom: 1.5rem;
  color: white;
  text-shadow: 0 10px 30px rgba(0,0,0,0.5);
}
.hero-content-centered p {
  font-size: 1.25rem;
  color: #e2e8f0;
  margin-bottom: 2.5rem;
  text-shadow: 0 4px 15px rgba(0,0,0,0.5);
  line-height: 1.6;
}
.hero-actions {
  display: flex;
  gap: 1.5rem;
}
.btn-outline-light {
  background-color: transparent;
  color: white;
  border: 2px solid white;
}
.btn-outline-light:hover {
  background-color: white;
  color: var(--text-dark);
}

/* ================= MARQUEE LOOP (SMOOTH, NO EDGES) ================= */
.marquee-divider {
  width: 100%;
  background: var(--primary-hover); 
  color: var(--surface);
  padding: 1.25rem 0;
  overflow: hidden;
  position: relative;
  display: flex;
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.alternate {
  background: var(--primary-hover);
}
.marquee-track.smooth {
  display: flex;
  white-space: nowrap;
  animation: marquee 30s linear infinite;
  will-change: transform;
}
.marquee-track.reverse {
  animation: marquee-reverse 30s linear infinite;
}
.marquee-track span {
  padding: 0 3rem;
  display: inline-block;
}
@keyframes marquee {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); } 
}
@keyframes marquee-reverse {
  0% { transform: translateX(-50%); }
  100% { transform: translateX(0); } 
}


/* ================= MENU & BUNDLES ================= */
.menu-section {
  padding-top: 6rem;
}
.section-header {
  text-align: center;
  margin-bottom: 3.5rem;
}
.section-header h2 {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}
.section-header p {
  color: var(--text-light);
  font-size: 1.1rem;
}

.categories-container {
  display: flex;
  justify-content: center;
  margin-bottom: 3.5rem;
}
.categories {
  display: flex;
  background: white;
  padding: 0.5rem;
  border-radius: var(--radius-full);
  box-shadow: 0 4px 15px rgba(0,0,0,0.05);
  gap: 0.25rem;
  border: 1px solid var(--border);
}
.cat-pill {
  padding: 0.8rem 1.8rem;
  border-radius: var(--radius-full);
  font-weight: 700;
  color: var(--text-light);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  font-size: 0.95rem;
  border: none;
  background: none;
  cursor: pointer;
}
.cat-pill:hover {
  color: var(--primary);
  background: var(--secondary);
}
.cat-pill.active {
  background: var(--text-dark);
  color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.see-all-container {
  display: flex;
  justify-content: center;
  margin-top: 1rem;
  margin-bottom: 4rem;
}
.see-all-btn {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 1.2rem 2.5rem;
  font-size: 1.1rem;
  font-weight: 700;
  border-radius: var(--radius-full);
}

.center-header { text-align: center; }
.center-header p { color: var(--text-light); margin-bottom: 2rem; }

.menu-category-section {
  margin-bottom: 5rem;
}
.category-divider {
  display: flex;
  align-items: center;
  margin-bottom: 2.5rem;
}
.category-divider::before, .category-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}
.category-divider span {
  padding: 0 1.5rem;
  font-size: 1.5rem;
  font-weight: 900;
  color: var(--text-dark);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.menu-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 2rem;
}
.menu-card {
  background: white;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0,0,0,0.03);
  border: 1px solid rgba(0,0,0,0.02);
  transition: transform 0.3s, box-shadow 0.3s;
  display: flex;
  flex-direction: column;
  cursor: pointer;
}
.menu-card:hover {
  transform: translateY(-8px);
  box-shadow: var(--shadow-md);
}
.card-img-wrapper {
  position: relative;
  height: 240px;
  overflow: hidden;
}
.card-img-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}
.menu-card:hover .card-img-wrapper img {
  transform: scale(1.06);
}
.popular-badge {
  position: absolute;
  top: 15px;
  right: 15px;
  background: white;
  color: var(--primary);
  font-size: 0.75rem;
  font-weight: 800;
  padding: 0.4rem 0.8rem;
  border-radius: var(--radius-full);
  z-index: 10;
  box-shadow: var(--shadow-sm);
  text-transform: uppercase;
}
.card-content {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  flex: 1;
}
.card-title {
  font-size: 1.3rem;
  font-weight: 800;
  margin-bottom: 0.5rem;
}
.card-desc {
  font-size: 0.95rem;
  color: var(--text-light);
  margin-bottom: 1.5rem;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.add-btn {
  background: var(--bg);
  color: var(--text-dark);
  width: 44px;
  height: 44px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.menu-card:hover .add-btn {
  background: var(--primary);
  color: white;
}

/* Bundles */
.bundles-section {
  padding: 6rem 0;
  background: #fff;
}
.bundles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
  gap: 2.5rem;
}
.bundle-card {
  background: var(--bg);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0,0,0,0.03);
  transition: all 0.3s;
  cursor: pointer;
}
.bundle-card:hover {
  transform: translateY(-5px);
  box-shadow: var(--shadow-md);
}
.bundle-img-wrapper {
  height: 240px;
  overflow: hidden;
  background: var(--bg);
}
.bundle-img-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s;
}
.bundle-card:hover .bundle-img-wrapper img {
  transform: scale(1.03);
}
.bundle-content {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  flex: 1;
}
.bundle-info h3 {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--text-dark);
  margin-bottom: 0.5rem;
}
.bundle-info p {
  color: var(--text-light);
  line-height: 1.5;
  margin-bottom: 1.25rem;
  font-size: 0.95rem;
}
.price-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.price {
  font-weight: 800;
  color: var(--primary);
  font-size: 1.4rem;
}
.old-price {
  text-decoration: line-through;
  color: #94a3b8;
  font-size: 1.1rem;
}
.bundle-btn {
  width: 100%;
  padding: 1rem;
  font-size: 1rem;
  border-radius: var(--radius-full);
}


/* ================= FOOD DETAIL MODAL ================= */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(5px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.food-detail-modal {
  background: white;
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 480px;
  overflow: hidden;
  box-shadow: 0 25px 50px rgba(0,0,0,0.25);
  position: relative;
  animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes scaleUp {
  0% { transform: scale(0.95); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
.close-modal {
  position: absolute;
  top: 15px;
  right: 15px;
  width: 36px;
  height: 36px;
  background: rgba(0,0,0,0.5);
  color: white;
  border-radius: 50%;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  backdrop-filter: blur(4px);
  transition: background 0.2s;
}
.close-modal:hover {
  background: rgba(0,0,0,0.8);
}
.modal-img-wrapper {
  height: 280px;
  width: 100%;
}
.modal-img-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.modal-content {
  padding: 2rem;
}
.modal-content h2 {
  font-size: 1.8rem;
  margin-bottom: 0.5rem;
}
.modal-desc {
  color: var(--text-light);
  line-height: 1.6;
  margin-bottom: 2rem;
}
.modal-action-area {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}
.modal-price {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--primary);
}
.qty-control-huge {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: var(--secondary);
  padding: 0.5rem;
  border-radius: var(--radius-full);
}
.qty-control-huge button {
  width: 40px;
  height: 40px;
  background: white;
  border-radius: 50%;
  font-size: 1.25rem;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  transition: all 0.2s;
}
.qty-control-huge button:hover {
  background: var(--text-dark);
  color: white;
}
.qty-num {
  font-size: 1.25rem;
  font-weight: 800;
  width: 30px;
  text-align: center;
}
.add-to-cart-big {
  padding: 1.25rem;
  font-size: 1.1rem;
}


/* ================= PAGES GENERIC ================= */
.page-container {
  padding: 4rem 0 8rem;
  background: var(--bg);
  min-height: calc(100vh - var(--header-height));
}
.page-header {
  margin-bottom: 3rem;
}
.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: white;
  color: var(--text-dark);
  padding: 0.6rem 1.25rem;
  border-radius: var(--radius-full);
  font-weight: 600;
  margin-bottom: 2rem;
  transition: all 0.2s;
  box-shadow: 0 4px 15px rgba(0,0,0,0.03);
  border: 1px solid rgba(0,0,0,0.05);
  cursor: pointer;
}
.back-btn:hover {
  background: var(--bg);
  transform: translateX(-3px);
  color: var(--primary);
}
.page-header h2 {
  font-size: 2.5rem;
}

/* ================= CART PAGE ================= */
.cart-layout {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 3rem;
  align-items: start;
}
.cart-items-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-height: 540px;
  overflow-y: auto;
  padding-right: 0.5rem;
}
.cart-items-list::-webkit-scrollbar { width: 6px; }
.cart-items-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }
.cart-item-card {
  background: white;
  border-radius: var(--radius-lg);
  padding: 1.2rem;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  box-shadow: 0 4px 20px rgba(0,0,0,0.04);
  border: 1px solid rgba(0,0,0,0.03);
  transition: transform 0.2s;
}
.cart-item-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
.cart-item-img-wrapper {
  width: 110px;
  height: 110px;
  border-radius: var(--radius-md);
  overflow: hidden;
  flex-shrink: 0;
}
.cart-item-img-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cart-item-card .item-details {
  flex: 1;
}
.cart-item-card .item-details h4 {
  font-size: 1.25rem;
  margin-bottom: 0.3rem;
  color: var(--text-dark);
}
.item-desc-cart {
  font-size: 0.85rem;
  color: var(--text-light);
  margin-bottom: 0.6rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.cart-item-card .item-price {
  font-size: 1.15rem;
  color: var(--primary);
  font-weight: 800;
}
.cart-item-actions {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}
.qty-controls-modern {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  background: var(--bg);
  padding: 0.4rem 0.6rem;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
}
.qty-controls-modern button {
  background: white;
  color: var(--text-dark);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid rgba(0,0,0,0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 5px rgba(0,0,0,0.05);
}
.qty-controls-modern button:hover {
  background: var(--primary);
  color: white;
}
.qty-controls-modern span {
  font-weight: 700;
  font-size: 1rem;
  min-width: 20px;
  text-align: center;
}
.delete-btn-modern {
  color: #ef4444;
  background: #fee2e2;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.delete-btn-modern:hover {
  background: #dc2626;
  color: white;
}
.cart-summary-card {
  background: white;
  border-radius: var(--radius-lg);
  padding: 2rem;
  box-shadow: 0 4px 20px rgba(0,0,0,0.04);
  border: 1px solid var(--border);
}
.cart-summary-card h3 {
  font-size: 1.4rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(0,0,0,0.05);
}
.summary-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 1rem;
  color: var(--text-light);
  font-weight: 500;
}
.summary-divider {
  border: none;
  border-top: 1px dashed rgba(0,0,0,0.1);
  margin: 1.5rem 0;
}
.summary-row.total {
  color: var(--text-dark);
  font-weight: 800;
  align-items: center;
}
.total-amount-large {
  font-size: 1.8rem;
  color: var(--primary);
}
.w-full {
  width: 100%;
}
.checkout-btn {
  margin-top: 2rem;
  padding: 1.1rem;
}
.empty-state {
  text-align: center;
  padding: 5rem 0;
}
.empty-state .empty-icon {
  font-size: 5rem;
  margin-bottom: 1.5rem;
  animation: float 4s ease-in-out infinite;
}

/* ================= CHECKOUT PAGE ================= */
.checkout-layout {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 3rem;
  align-items: start;
}
.checkout-form {
  background: white;
  border-radius: var(--radius-lg);
  padding: 2.5rem;
  box-shadow: 0 4px 15px rgba(0,0,0,0.02);
  border: 1px solid var(--border);
}
.form-section h3 {
  font-size: 1.3rem;
  margin-bottom: 1.5rem;
}
.form-group {
  margin-bottom: 1.5rem;
}
.form-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--text-dark);
}
.form-group input, .form-group textarea {
  width: 100%;
  padding: 1rem;
  border: 1px solid rgba(0,0,0,0.1);
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 1rem;
  transition: border 0.2s;
}
.form-group input:focus, .form-group textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 4px var(--secondary);
}
.checkout-title-with-icon {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-bottom: 1.5rem;
}
.checkout-title-with-icon h3 {
  margin-bottom: 0;
}
.icon-circle {
  background: var(--secondary);
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 1.1rem;
}
.mt-4 { margin-top: 3rem; }
.payment-options {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.payment-card {
  display: flex;
  align-items: center;
  padding: 1.25rem;
  border: 2px solid rgba(0,0,0,0.05);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
}
.payment-card:hover {
  background: var(--bg);
}
.payment-card.selected {
  border-color: var(--primary);
  background: var(--secondary);
}
.payment-card input {
  margin-right: 1.25rem;
  transform: scale(1.2);
  accent-color: var(--primary);
}
.payment-info strong {
  display: block;
  font-size: 1.1rem;
  color: var(--text-dark);
}
.payment-info span {
  font-size: 0.9rem;
  color: var(--text-light);
}
.summary-list {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  max-height: 250px;
  overflow-y: auto;
  padding-right: 0.5rem;
}
.summary-list::-webkit-scrollbar { width: 6px; }
.summary-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }
.text-sm { font-size: 0.95rem; }
.text-gray { color: var(--text-light); }
.pay-btn { margin-top: 2rem; padding: 1.1rem; }


/* ================= INVOICE PAGE ================= */
.invoice-content {
  display: flex;
  justify-content: center;
}
.invoice-card {
  background: white;
  width: 100%;
  max-width: 500px;
  border-radius: var(--radius-lg);
  padding: 3rem;
  box-shadow: 0 10px 40px rgba(0,0,0,0.05);
  text-align: center;
  border: 1px solid var(--border);
}
.success-icon {
  width: 80px;
  height: 80px;
  background: #22c55e;
  color: white;
  font-size: 3rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1.5rem;
  box-shadow: 0 10px 20px rgba(34, 197, 94, 0.3);
}
.invoice-card h2 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}
.invoice-subtitle {
  color: var(--text-light);
  margin-bottom: 2.5rem;
}
/* ================= REFINED COMING SOON: LIQUID GLASS ================= */
.cs-header-centered {
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
  height: clamp(60px, 10vh, 100px);
  position: relative;
  z-index: 1000;
}
.cs-header-centered .logo-img {
  height: 60px;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.1));
}

.coming-soon-header {
  background: transparent !important;
  border-bottom: none !important;
  position: fixed !important;
  top: 0;
  width: 100%;
}

.coming-soon-container {
  position: relative;
  height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #fdfdfd;
  overflow: hidden;
  color: var(--text-dark);
}

/* 1. Deep Mesh Gradient Background */
.cs-background {
  position: absolute;
  inset: 0;
  z-index: 1;
  background-color: #ffffff;
  background-image: 
    radial-gradient(at 0% 0%, hsla(12, 100%, 94%, 1) 0%, transparent 50%),
    radial-gradient(at 100% 0%, hsla(180, 100%, 94%, 1) 0%, transparent 50%),
    radial-gradient(at 100% 100%, hsla(240, 100%, 94%, 1) 0%, transparent 50%),
    radial-gradient(at 0% 100%, hsla(300, 100%, 94%, 1) 0%, transparent 50%),
    radial-gradient(at 50% 50%, hsla(45, 100%, 96%, 1) 0%, transparent 50%);
  filter: blur(40px);
  animation: meshFlow 20s infinite alternate ease-in-out;
}

/* 2. Floating Light Blobs */
.cs-background::before, .cs-background::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  z-index: 1;
  opacity: 0.4;
  animation: floatBlobs 25s infinite alternate ease-in-out;
}
.cs-background::before {
  width: 500px;
  height: 500px;
  background: var(--primary-light, #ffefed);
  top: 20%;
  left: 10%;
}
.cs-background::after {
  width: 400px;
  height: 400px;
  background: #e0f2fe;
  bottom: 20%;
  right: 10%;
  animation-delay: -5s;
}

@keyframes meshFlow {
  0% { transform: scale(1); }
  100% { transform: scale(1.1) rotate(2deg); }
}

@keyframes floatBlobs {
  0% { transform: translate(0, 0); }
  100% { transform: translate(150px, 100px); }
}

.cs-characters {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}
.cs-char {
  position: absolute;
  width: clamp(280px, 35vw, 420px);
  height: auto;
  filter: drop-shadow(0 20px 40px rgba(0,0,0,0.15));
}
.cs-char-1 {
  top: 22%;
  left: -2%;
  animation: floatChar 8s infinite ease-in-out;
}
.cs-char-2 {
  bottom: 5%;
  right: -2%;
  animation: floatChar 8s infinite ease-in-out reverse;
  animation-delay: 2s;
}

@keyframes floatChar {
  0%, 100% { transform: translateY(0) rotate(-5deg) scale(1); }
  50% { transform: translateY(-40px) rotate(5deg) scale(1.05); }
}

/* 3. Main Content Center */
.cs-content {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 100%;
  padding-top: clamp(80px, 15vh, 120px);
}

.cs-text-section {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(0.25rem, 1vh, 0.75rem);
}

/* 4. Pulsing Badge */
.cs-badge {
  background: white;
  color: var(--primary);
  padding: 0.5rem 1.4rem;
  border-radius: var(--radius-full);
  font-weight: 800;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  box-shadow: 0 4px 15px rgba(0,0,0,0.05);
  border: 1px solid rgba(180, 42, 23, 0.15);
  animation: pulseBadge 3s infinite ease-in-out;
}

@keyframes pulseBadge {
  0%, 100% { transform: scale(1); box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
  50% { transform: scale(1.05); box-shadow: 0 8px 25px rgba(180, 42, 23, 0.15); }
}

/* 5. Shimmering Typography */
.cs-title {
  font-size: clamp(2.2rem, 6vw, 3.5rem);
  font-weight: 950;
  color: #1a1a1a;
  line-height: 1.05;
  letter-spacing: -0.02em;
  margin: 2rem 0 0.5rem;
}
.cs-title span {
  position: relative;
  background: linear-gradient(90deg, var(--primary) 0%, #ef4444 45%, #fca5a5 50%, #ef4444 55%, var(--primary) 100%);
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shimmerTitle 6s linear infinite;
}

@keyframes shimmerTitle {
  to { background-position: 200% center; }
}

.cs-subtitle {
  font-size: clamp(0.85rem, 1.2vw, 1rem);
  color: #4b5563;
  max-width: 500px;
  line-height: 1.6;
}

/* 6. Liquid Glass Cards */
.cs-countdown {
  display: flex;
  gap: clamp(0.7rem, 2vw, 1.2rem);
  margin: 0.5rem 0;
  flex-wrap: wrap;
  justify-content: center;
}
.countdown-item {
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  padding: clamp(0.6rem, 1.5vh, 1.2rem);
  border-radius: 20px;
  min-width: clamp(70px, 9vw, 100px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 15px 45px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(255,255,255,0.4);
  border: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.countdown-item:hover {
  transform: translateY(-5px) scale(1.02);
  background: rgba(255, 255, 255, 0.6);
  box-shadow: 0 20px 50px rgba(0,0,0,0.1), inset 0 0 0 1.5px rgba(255,255,255,0.6);
}
.countdown-item .number {
  font-size: clamp(1.8rem, 4vw, 3rem);
  font-weight: 950;
  color: var(--primary);
  line-height: 1;
}
.countdown-item .label {
  font-size: 0.7rem;
  text-transform: uppercase;
  color: #6b7280;
  font-weight: 700;
  margin-top: 0.5rem;
  letter-spacing: 0.05em;
}

/* Form Container High-End */
.cs-form-container {
  width: 100%;
  max-width: 440px;
  margin-top: 0.25rem;
}
.cs-form-wrapper {
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  padding: clamp(1.2rem, 2.5vh, 2rem);
  border-radius: 28px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.08), inset 0 0 0 1.5px rgba(255,255,255,0.4);
  border: none;
}
.cs-form-wrapper h3 {
  margin-bottom: 1rem;
  font-size: clamp(1rem, 1.8vw, 1.2rem);
  font-weight: 900;
  color: #1a1a1a;
}
.cs-form {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}
.cs-form input {
  padding: 0.8rem 1.25rem;
  border-radius: 12px;
  border: 1.5px solid rgba(0,0,0,0.05);
  background: rgba(255,255,255,0.8);
  font-size: 0.95rem;
  transition: all 0.3s;
}
.cs-form input:focus {
  outline: none;
  border-color: var(--primary);
  background: #fff;
  box-shadow: 0 0 0 6px rgba(180, 42, 23, 0.08);
}
.cs-submit-btn {
  padding: 0.85rem;
  font-size: 1.05rem;
  border-radius: 12px;
  font-weight: 800;
  box-shadow: 0 10px 20px rgba(180, 42, 23, 0.2);
}

/* 7. Marquee Duo: Top & Bottom (Red Brand) */
.cs-top-marquee {
  position: absolute;
  top: clamp(60px, 10vh, 90px);
  background: var(--primary);
  padding: 0.5rem 0;
  border-bottom: 2px solid rgba(0,0,0,0.1);
  color: #ffffff;
  font-size: 0.8rem;
  z-index: 100;
  box-shadow: 0 4px 15px rgba(180, 42, 23, 0.2);
}
.cs-bottom-marquee {
  position: absolute;
  bottom: 0;
  background: var(--primary);
  padding: 0.75rem 0;
  border-top: 2px solid rgba(0,0,0,0.1);
  color: #ffffff;
  font-size: 0.85rem;
  z-index: 100;
  box-shadow: 0 -4px 15px rgba(180, 42, 23, 0.2);
}
.cs-top-marquee .marquee-track span, .cs-bottom-marquee .marquee-track span {
  padding: 0 2rem;
  font-weight: 800;
  opacity: 1;
}

.cs-success-msg {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(40px);
  padding: 3rem;
  border-radius: 32px;
  box-shadow: 0 30px 70px rgba(34, 197, 94, 0.1), inset 0 0 0 1px rgba(255,255,255,0.5);
}
.success-icon {
  font-size: 3.5rem;
  margin-bottom: 1rem;
  display: block;
}

@media (max-width: 768px) {
  .cs-char {
    display: block;
    width: clamp(150px, 40vw, 190px);
    opacity: 0.95;
    z-index: 2;
  }
  .cs-char-1 {
    top: 15%;
    left: -12%;
  }
  .cs-char-2 {
    top: 15%;
    right: -12%;
    bottom: auto;
  }
  .cs-header-centered {
    height: 50px;
  }
  .cs-header-centered .logo-img {
    height: 40px;
  }
  .cs-top-marquee {
    top: 50px;
    padding: 0.35rem 0;
    font-size: 0.65rem;
  }
  .cs-bottom-marquee {
    font-size: 0.65rem;
    padding: 0.4rem 0;
  }
  .cs-content {
    margin-top: 0.8rem;
    padding-top: 0;
  }
  .cs-text-section {
    gap: 0.4rem;
  }
  .cs-badge {
    padding: 0.25rem 0.8rem;
    font-size: 0.7rem;
    margin-bottom: 0.1rem;
  }
  .cs-title {
    font-size: 1.8rem;
    line-height: 1.1;
    margin-top: 1.2rem;
  }
  .cs-subtitle {
    font-size: 0.75rem;
    margin-bottom: 0.1rem;
    line-height: 1.3;
    max-width: 320px;
  }
  .cs-countdown {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
    width: 100%;
    max-width: 340px;
    margin: 0.6rem 0;
  }
  .countdown-item {
    min-width: unset;
    padding: 0.5rem;
    border-radius: 12px;
  }
  .countdown-item .number {
    font-size: 1.25rem;
  }
  .countdown-item .label {
    font-size: 0.55rem;
    margin-top: 0.2rem;
  }
  .cs-form-container {
    margin-top: 0.1rem;
  }
  .cs-form-wrapper {
    padding: 1rem;
    border-radius: 20px;
  }
  .cs-form-wrapper h3 {
    font-size: 0.95rem;
    margin-bottom: 0.6rem;
  }
  .cs-form {
    gap: 0.5rem;
  }
  .cs-form input {
    padding: 0.6rem 0.8rem;
    font-size: 0.85rem;
    border-radius: 10px;
  }
  .cs-submit-btn {
    padding: 0.6rem;
    font-size: 0.95rem;
    border-radius: 10px;
  }
  .cs-success-msg {
    padding: 1.5rem 1rem;
  }
  .cs-bottom-marquee {
    font-size: 0.7rem;
    padding: 0.5rem 0;
  }
}

.invoice-details {
  background: var(--secondary);
  padding: 1.5rem;
  border-radius: var(--radius-md);
  text-align: left;
  margin-bottom: 2rem;
}
.invoice-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.invoice-row:last-child { margin-bottom: 0; }
.invoice-row .label {
  color: var(--text-dark);
  font-weight: 500;
}
.invoice-row .value {
  font-weight: 700;
  color: var(--text-dark);
}
.order-id { color: var(--primary) !important; }
.capitalize { text-transform: capitalize; }
.invoice-items {
  text-align: left;
  margin-bottom: 2.5rem;
}
.invoice-items h4 {
  font-size: 1.2rem;
  margin-bottom: 1rem;
  border-bottom: 2px solid var(--border);
  padding-bottom: 0.5rem;
}
.mt-3 { margin-top: 1.5rem; }
.wa-btn:hover { background: #1faf53; color: white; border-color:#1faf53; }

.invoice-loading-state, .error-state {
  background: white;
  padding: 4rem;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  text-align: center;
  margin-top: 2rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1.5rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.badge-status.success { background: #dcfce7; color: #166534; }
.badge-status.pending { background: #fef3c7; color: #92400e; }
.badge-status.failed { background: #fee2e2; color: #ef4444; }


/* Mobile Bottom Navigation Hidden by Default */
.mobile-bottom-nav {
  display: none;
}

@media (max-width: 992px) {
  .hero-content-centered h1 { font-size: 3.5rem; }
  .cart-layout, .checkout-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .loader-text {
    font-size: 2.2rem;
  }
  .loader-line-wrapper {
    width: 100px;
  }
  .header-grid {
    grid-template-columns: 1fr auto;
    gap: 0.5rem;
  }
  .logo {
    display: flex;
    align-items: center;
  }
  .logo-img {
    height: 60px;
  }
  .page-header {
    margin-bottom: 1.5rem;
  }
  .page-header h2 {
    font-size: 1.8rem;
  }
  .page-container {
    padding-top: 2rem;
  }
  .hero-full {
    height: 70vh;
    min-height: 400px;
    background-size: cover;
  }
  .hero-content-centered {
    padding: 0 1rem;
  }
  .hero-content-centered h1 { 
    font-size: 2.2rem; 
    margin-bottom: 1rem;
  }
  .hero-content-centered p {
    font-size: 1rem;
    margin-bottom: 1.5rem;
  }
  .hero-actions {
    gap: 0.8rem;
  }
  .btn {
    padding: 0.7rem 1.2rem;
    font-size: 0.9rem;
  }
  
  .menu-grid {
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 0.75rem !important;
  }
  .card-img-wrapper {
    height: 110px !important;
  }
  .card-content {
    padding: 0.75rem !important;
  }
  .card-title {
    font-size: 0.95rem !important;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card-desc {
    font-size: 0.75rem !important;
    margin-bottom: 0.75rem !important;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .price {
    font-size: 0.9rem !important;
  }
  .categories-container {
    margin-bottom: 2rem;
    overflow-x: auto;
    justify-content: flex-start;
    padding: 0 1rem;
    -webkit-overflow-scrolling: touch;
  }
  .categories-container::-webkit-scrollbar { display: none; }
  .categories {
    box-shadow: none;
    background: transparent;
    padding: 0;
    gap: 0.5rem;
    border: none;
  }
  .cat-pill {
    padding: 0.6rem 1.2rem;
    font-size: 0.85rem;
    white-space: nowrap;
    background: white;
    border: 1px solid var(--border);
  }
  .cat-pill.active {
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  }
  .category-divider span {
    font-size: 1.1rem;
    padding: 0 1rem;
  }
  .add-btn svg {
    width: 14px;
    height: 14px;
  }
  .popular-badge {
    font-size: 0.6rem !important;
    padding: 0.2rem 0.5rem !important;
    top: 8px !important;
    right: 8px !important;
  }

  .bundles-grid {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
  
  .cart-item-card {
    display: grid;
    grid-template-columns: 80px 1fr;
    grid-template-rows: auto auto;
    gap: 0.5rem 1rem;
    padding: 1rem !important;
    text-align: left;
  }
  .cart-item-img-wrapper {
    grid-column: 1;
    grid-row: 1 / span 2;
    width: 80px;
    height: 80px;
  }
  .cart-item-card .item-details {
    grid-column: 2;
    grid-row: 1;
  }
  .cart-item-card .item-details h4 {
    font-size: 1.1rem;
  }
  .cart-item-card .item-price {
    font-size: 1rem;
  }
  .item-desc-cart {
    -webkit-line-clamp: 1;
    line-clamp: 1;
    margin-bottom: 0.3rem;
  }
  .cart-item-actions {
    grid-column: 2;
    grid-row: 2;
    margin-left: 0;
    width: 100%;
    justify-content: space-between;
  }
  .qty-controls-modern {
    padding: 0.3rem 0.5rem;
    gap: 0.5rem;
  }
  .qty-controls-modern button {
    width: 24px;
    height: 24px;
  }
  .qty-controls-modern span {
    font-size: 0.9rem;
  }
  .delete-btn-modern {
    width: 32px;
    height: 32px;
    padding: 0.3rem;
  }
  
  /* Fix Modal Sizing */
  .food-detail-modal {
    max-height: 90vh; /* Don't overflow screen */
    overflow-y: auto; 
    border-radius: var(--radius-md);
  }
  .modal-img-wrapper {
    height: 200px;
  }
  .modal-content {
    padding: 1.25rem;
  }
  .modal-content h2 {
    font-size: 1.4rem;
  }
  .modal-desc {
    font-size: 0.85rem;
    margin-bottom: 1rem;
  }
  .modal-price {
    font-size: 1.2rem;
  }
  .qty-control-huge {
    padding: 0.25rem 0.5rem;
  }
  .qty-control-huge button {
    width: 30px;
    height: 30px;
    font-size: 1rem;
  }
  .qty-num {
    font-size: 1rem;
    width: 20px;
  }
  .add-to-cart-big {
    padding: 0.8rem;
    font-size: 0.95rem;
  }
  
  /* Additional padding for bottom nav space */
  .page-container {
    padding-bottom: 100px;
  }
  
  /* Show Mobile Bottom Navigation */
  .mobile-bottom-nav {
    display: flex;
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(210, 230, 255, 0.75);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: var(--radius-full);
    padding: 0 1rem;
    height: 64px;
    justify-content: space-around;
    align-items: center;
    width: 80%;
    max-width: 320px;
    z-index: 99;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
    border: none;
  }
  .cart-badge-mini {
    position: absolute;
    top: 10px;
    right: 10px;
    background: var(--primary);
    color: white;
    font-size: 0.7rem;
    font-weight: 800;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid white;
    z-index: 10;
  }
  .mobile-nav-item {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: #475569;
    height: 100%;
    width: 64px;
    transition: all 0.3s;
  }
  .mobile-nav-item span {
    display: none;
  }
  .mobile-nav-item svg {
    width: 26px;
    height: 26px;
    transition: transform 0.2s, color 0.3s;
    z-index: 2;
  }
  .mobile-nav-item.active {
    color: var(--primary);
  }
  .mobile-nav-item.active::before {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 32px;
    height: 3px;
    background: var(--primary);
    border-radius: 0 0 4px 4px;
    box-shadow: 0 2px 10px var(--primary);
  }
  .mobile-nav-item.active::after {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 44px;
    height: 100%;
    background: linear-gradient(to bottom, rgba(59, 130, 246, 0.25) 0%, transparent 80%);
    pointer-events: none;
    clip-path: polygon(25% 0, 75% 0, 100% 100%, 0% 100%);
  }

  /* Invoice Mobile Overrides */
  .invoice-card {
    padding: 1.5rem !important;
  }
  .invoice-card h2 {
    font-size: 1.6rem;
  }
  .invoice-details {
    padding: 1.25rem;
  }
  .invoice-row {
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-bottom: 0.8rem;
  }
  .invoice-row .value {
    word-break: break-all;
  }
  .invoice-items .summary-row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }
  .invoice-items .summary-row span:first-child {
    flex: 1;
    text-align: left;
    line-height: 1.4;
  }
  .invoice-items .summary-row span:last-child {
    white-space: nowrap;
    padding-left: 0.5rem;
  }
}

</style>


