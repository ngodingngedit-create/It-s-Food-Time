<script setup>
import { ref } from 'vue'

const reviews = ref([
  {
    id: 1,
    name: 'Andi Saputra',
    instagram: '@andisptr_',
    role: 'Mahasiswa Teknik',
    rating: 5,
    comment: 'Rice bowl chicken popcorn-nya juara! Porsinya pas buat makan siang di kampus, sausnya juga enak banget. Bakal pesen lagi sih ini.',
    date: '2 hari yang lalu',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Andi',
    foodImage: '/maincourse/ricebowl.png'
  },
  {
    id: 2,
    name: 'Siti Aminah',
    instagram: '@sitiamnh.ae',
    role: 'Mahasiswa Ekonomi',
    rating: 4,
    comment: 'Brazilian Lemonade-nya seger banget, pas banget buat diminum siang-siang pas lagi panas. Seger pol!',
    date: '1 minggu yang lalu',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Siti',
    foodImage: '/drinks/brazilianlemonade.png'
  },
  {
    id: 3,
    name: 'Budi Santoso',
    instagram: '@budisantoso_ok',
    role: 'Mahasiswa Telkom',
    rating: 5,
    comment: 'Dimsumnya lumer di mulut! Paket jajan bener-bener worth it buat kantong mahasiswa. Pengiriman juga cepet banget nyampenya.',
    date: '3 hari yang lalu',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Budi',
    foodImage: '/maincourse/dimsum.png'
  },
  {
    id: 4,
    name: 'Riska Amalia',
    instagram: '@riskaml',
    role: 'Mahasiswa DKV',
    rating: 5,
    comment: 'Kimbabnya enak banget, isiannya melimpah. Cocok buat bekel kuliah pagi kalau telat sarapan.',
    date: '4 hari yang lalu',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Riska',
    foodImage: '/maincourse/kimbab.png'
  },
  {
    id: 5,
    name: 'Kevin Pratama',
    instagram: '@kevinp_dev',
    role: 'Mahasiswa Informatika',
    rating: 5,
    comment: 'Basrengnya pedes nagih! Gak bisa berhenti ngunyah pas lagi ngerjain tugas.',
    date: '5 hari yang lalu',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Kevin',
    foodImage: '/snacks/basreng.png'
  }
])

const showForm = ref(false)
const selectedReview = ref(null)

const newReview = ref({
  name: '',
  instagram: '',
  role: '',
  rating: 5,
  comment: '',
  foodImage: '/maincourse/ricebowl.png'
})

const submitReview = () => {
  if (!newReview.value.name || !newReview.value.comment) {
    alert('Mohon isi nama dan komentar Anda.')
    return
  }
  
  const review = {
    id: Date.now(),
    ...newReview.value,
    date: 'Baru saja',
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${newReview.value.name}`
  }
  
  reviews.value.unshift(review)
  newReview.value = { name: '', instagram: '', role: '', rating: 5, comment: '', foodImage: '/maincourse/ricebowl.png' }
  showForm.value = false
  alert('Terima kasih atas ulasan Anda!')
}

const openReviewDetail = (review) => {
  selectedReview.value = review
}

const closeReviewDetail = () => {
  selectedReview.value = null
}
</script>

<template>
  <section id="reviews" class="reviews-section">
    <div class="container">
      <div class="section-header">
        <h2>Apa Kata Mereka?</h2>
        <p>Ulasan jujur dari teman-teman mahasiswa yang sudah mencoba menu kami.</p>
      </div>

      <!-- Looping Marquee Container -->
      <div class="reviews-marquee-container">
        <div class="marquee-track">
          <!-- Double the items for seamless loop -->
          <div 
            v-for="review in [...reviews, ...reviews]" 
            :key="review.id + Math.random()" 
            class="review-card"
            @click="openReviewDetail(review)"
          >
            <div class="review-header">
              <div class="user-meta">
                <h4>{{ review.name }}</h4>
                <span class="instagram">{{ review.instagram }}</span>
              </div>
              <div class="rating">
                <span v-for="star in 5" :key="star" :class="{ 'star-active': star <= review.rating }">★</span>
              </div>
            </div>
            
            <p class="review-text">{{ review.comment }}</p>
            
            <div class="food-preview">
              <img :src="review.foodImage" :alt="review.name" class="food-thumb" />
            </div>

            <div class="review-footer">
              <span class="review-date">{{ review.date }}</span>
              <span class="read-more">Detail →</span>
            </div>
          </div>
        </div>
      </div>

      <div class="action-container mt-4">
        <button class="btn btn-primary add-review-btn" @click="showForm = true">
          Tulis Ulasan Kamu
        </button>
      </div>

      <!-- Form Modal -->
      <Transition name="fade">
        <div v-if="showForm" class="review-modal-overlay form-overlay" @click.self="showForm = false">
          <div class="review-form-card">
            <button class="close-btn" @click="showForm = false">×</button>
            <h3>Berikan Ulasan</h3>
            <form @submit.prevent="submitReview" class="review-form">
              <div class="form-row">
                <div class="form-group">
                  <label>Nama Lengkap</label>
                  <input v-model="newReview.name" type="text" placeholder="John Doe" required />
                </div>
                <div class="form-group">
                  <label>Instagram</label>
                  <input v-model="newReview.instagram" type="text" placeholder="@username" />
                </div>
              </div>
              <div class="form-group">
                <label>Status (Contoh: Mahasiswa IT)</label>
                <input v-model="newReview.role" type="text" placeholder="Mahasiswa Telkom" />
              </div>
              <div class="form-group">
                <label>Rating</label>
                <div class="rating-input">
                  <span v-for="star in 5" :key="star" class="star-input" :class="{ 'active': star <= newReview.rating }" @click="newReview.rating = star">★</span>
                </div>
              </div>
              <div class="form-group">
                <label>Komentar</label>
                <textarea v-model="newReview.comment" placeholder="Apa yang kamu suka dari menu kami?" rows="3" required></textarea>
              </div>
              <div class="form-group">
                <label>Menu yang diulas</label>
                <select v-model="newReview.foodImage" class="form-select">
                  <option value="/maincourse/ricebowl.png">Rice Bowl</option>
                  <option value="/maincourse/dimsum.png">Dimsum</option>
                  <option value="/drinks/brazilianlemonade.png">Lemonade</option>
                  <option value="/maincourse/kimbab.png">Kimbab</option>
                  <option value="/snacks/basreng.png">Basreng</option>
                </select>
              </div>
              <button type="submit" class="btn btn-primary w-full">Kirim Ulasan</button>
            </form>
          </div>
        </div>
      </Transition>

      <!-- Detail Modal -->
      <Transition name="fade">
        <div v-if="selectedReview" class="review-modal-overlay" @click.self="closeReviewDetail">
          <div class="review-detail-card">
            <div class="detail-header">
              <button class="close-btn" @click="closeReviewDetail">×</button>
              <div class="detail-meta">
                <h3>{{ selectedReview.name }}</h3>
                <span class="instagram">{{ selectedReview.instagram }}</span>
                <div class="rating large">
                  <span v-for="star in 5" :key="star" :class="{ 'star-active': star <= selectedReview.rating }">★</span>
                </div>
              </div>
            </div>
            <div class="detail-body">
              <p>{{ selectedReview.comment }}</p>
              <div class="detail-food-img">
                <img :src="selectedReview.foodImage" alt="Food" />
                <span>Ulasan Menu: {{ selectedReview.foodImage.split('/').pop().split('.')[0] }}</span>
              </div>
            </div>
            <div class="detail-footer">
              <span>Diposting pada {{ selectedReview.date }}</span>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </section>
</template>

<style scoped>
.reviews-section {
  padding: 6rem 0;
  background: #fdfdfd;
  overflow: hidden;
}

.section-header {
  margin-bottom: 3rem;
  text-align: center;
}

.section-tag {
  display: inline-block;
  background: var(--secondary);
  color: var(--primary);
  padding: 0.4rem 1rem;
  border-radius: var(--radius-full);
  font-size: 0.85rem;
  font-weight: 700;
  margin-bottom: 1rem;
  text-transform: uppercase;
}

/* Marquee Logic */
.reviews-marquee-container {
  width: 100%;
  display: flex;
  overflow: hidden;
  position: relative;
  padding: 1rem 0 3rem 0;
}

.marquee-track {
  display: flex;
  gap: 2rem;
  animation: marquee-scroll 40s linear infinite;
  padding-left: 2rem;
}

.marquee-track:hover {
  animation-play-state: paused;
}

@keyframes marquee-scroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(calc(-50% - 1rem)); }
}

.review-card {
  flex: 0 0 320px;
  background: white;
  padding: 1.5rem;
  border-radius: var(--radius-lg);
  box-shadow: 0 10px 30px rgba(0,0,0,0.03);
  border: 1px solid rgba(0,0,0,0.05);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
}

.review-card:hover {
  transform: scale(1.02);
  box-shadow: 0 15px 40px rgba(0,0,0,0.08);
  border-color: var(--primary);
}

.review-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.25rem;
}

.user-meta h4 {
  font-size: 1rem;
  font-weight: 800;
  margin: 0;
  color: var(--text-dark);
}

.instagram {
  font-size: 0.75rem;
  color: var(--primary);
  font-weight: 600;
}

.rating {
  color: #e2e8f0;
  font-size: 0.85rem;
}

.star-active {
  color: #fbbf24;
}

.review-text {
  font-size: 1.05rem;
  line-height: 1.6;
  color: var(--text-dark);
  margin-bottom: 1.5rem;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  position: relative;
  padding-left: 1.2rem;
}

.food-preview {
  display: block;
  width: 100%;
  height: 160px;
  border-radius: var(--radius-md);
  margin-bottom: 1.5rem;
  overflow: hidden;
  border: 1px solid rgba(0,0,0,0.05);
}

.food-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}

.review-card:hover .food-thumb {
  transform: scale(1.1);
}

.review-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  color: var(--text-light);
}

.read-more {
  color: var(--primary);
  font-weight: 800;
}

.action-container {
  display: flex;
  justify-content: center;
  max-width: 1200px;
  margin: 0 auto;
}

.add-review-btn {
  padding: 1rem 2.5rem;
  font-size: 1rem;
  font-weight: 700;
}

/* Modals */
.review-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.review-form-card, .review-detail-card {
  background: white;
  width: 100%;
  max-width: 550px;
  border-radius: var(--radius-lg);
  padding: 2rem;
  position: relative;
  box-shadow: 0 25px 50px rgba(0,0,0,0.25);
}

.close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: var(--text-light);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.form-group {
  margin-bottom: 1.25rem;
  text-align: left;
}

.form-group label {
  display: block;
  font-weight: 700;
  margin-bottom: 0.4rem;
  font-size: 0.85rem;
}

.form-group input, .form-group textarea, .form-select {
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  font-size: 0.95rem;
  background: #f8fafc;
}

.form-select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 1rem center;
  background-size: 1em;
}

.rating-input {
  display: flex;
  gap: 0.4rem;
  font-size: 1.5rem;
}

.star-input {
  cursor: pointer;
  color: #e2e8f0;
}

.star-input.active {
  color: #fbbf24;
}

/* Detail specific */
.detail-header {
  margin-bottom: 2rem;
  text-align: left;
}

.detail-meta h3 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 800;
}

.detail-meta .instagram {
  display: block;
  margin-bottom: 0.5rem;
}
.detail-food-img {
  margin-top: 1.5rem;
  background: #f1f5f9;
  padding: 1rem;
  border-radius: var(--radius-md);
  text-align: center;
}

.detail-food-img img {
  width: 100%;
  max-height: 250px;
  object-fit: cover;
  border-radius: 12px;
  margin-bottom: 0.75rem;
}

.detail-food-img span {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-light);
  text-transform: uppercase;
}

/* Responsive */
@media (max-width: 768px) {
  .marquee-track {
    animation-duration: 25s;
    gap: 1.25rem;
    padding-left: 1.25rem;
  }
  
  .review-card {
    flex: 0 0 260px; /* Reduced from 320px */
    padding: 1.25rem;
  }

  .review-text {
    font-size: 0.9rem;
    padding-left: 1rem;
    margin-bottom: 1rem;
  }

  .food-preview {
    height: 120px; /* Reduced from 160px */
    margin-bottom: 1rem;
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .section-header h2 {
    font-size: 1.75rem;
  }
}
@media (max-width: 768px) {
  .form-overlay {
    padding: 0 !important;
    align-items: flex-start !important;
  }
  .review-form-card {
    max-width: 100% !important;
    width: 100% !important;
    height: 100vh !important;
    border-radius: 0 !important;
    overflow-y: auto !important;
    padding: 2rem 1.5rem !important;
  }
  .review-detail-card {
    max-width: 92% !important;
    width: 92% !important;
    padding: 2rem 1.5rem !important;
    border-radius: 24px !important;
  }
  .detail-meta h3 {
    font-size: 1.3rem !important;
    padding-right: 1.5rem;
    line-height: 1.2;
    margin-bottom: 0.25rem;
  }
  .detail-body p {
    font-size: 1rem;
    line-height: 1.6;
    margin-bottom: 1.5rem;
  }
  .detail-food-img {
    padding: 0.75rem !important;
  }
  .detail-food-img img {
    max-height: 200px !important;
  }
}
</style>
