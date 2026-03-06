import Image from 'next/image'

export default function HenryPage() {
  return (
    <main className="min-h-[calc(100vh-65px)] bg-black flex items-center justify-center p-4">
      <div
        className="relative flex items-center justify-center overflow-hidden"
        style={{ width: 800, height: 600, backgroundColor: 'rgb(0,0,1)' }}
      >
        <Image
          src="/henrypic.jpg"
          alt="Henry"
          fill
          className="object-contain"
          sizes="800px"
        />
      </div>
    </main>
  )
}
