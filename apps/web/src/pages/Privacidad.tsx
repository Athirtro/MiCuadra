/**
 * Borrador de la política de tratamiento de datos (Ley 1581 de 2012).
 * PENDIENTE: el equipo debe revisarla y completar los datos del responsable antes de lanzar.
 */
export function Privacidad() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-8 leading-relaxed">
      <h1 className="text-3xl font-black">Política de tratamiento de datos</h1>
      <p className="mt-1 text-sm text-muted">Borrador · Ley 1581 de 2012 y Decreto 1377 de 2013</p>

      <h2 className="mt-6 text-xl font-black">Quién trata tus datos</h2>
      <p className="mt-2">
        MiCuadra, proyecto de estudiantes de la Universidad Tecnológica de Pereira, Pereira (Risaralda). Contacto para
        consultas y reclamos: el correo que publique el equipo en esta página.
      </p>

      <h2 className="mt-6 text-xl font-black">Qué datos guardamos</h2>
      <ul className="mt-2 list-disc pl-6">
        <li>De tu cuenta: nombre, correo, foto (si entras con Google), celular y barrio.</li>
        <li>De los negocios: nombre, categoría, WhatsApp, dirección, ubicación, horarios y fotos.</li>
        <li>De uso: qué páginas y botones se tocan, con un identificador aleatorio que no dice quién eres.</li>
      </ul>

      <h2 className="mt-6 text-xl font-black">Para qué</h2>
      <ul className="mt-2 list-disc pl-6">
        <li>Mostrar los negocios del barrio y permitir que los vecinos los contacten.</li>
        <li>Revisar y aprobar los negocios que se registran.</li>
        <li>Avisarte de cambios en tu cuenta o en tu negocio.</li>
        <li>Medir qué tanto se usa MiCuadra para mejorarla.</li>
      </ul>
      <p className="mt-2">No vendemos tus datos. Tu celular no se muestra a otros usuarios.</p>

      <h2 className="mt-6 text-xl font-black">Tu ubicación</h2>
      <p className="mt-2">
        Si das permiso, el mapa usa tu ubicación para mostrarte los negocios cercanos y el punto azul de dónde estás. No
        la guardamos. Cuando pides el camino a un negocio, tu punto de partida y el del negocio se envían al servicio de
        rutas de OpenStreetMap (routing.openstreetmap.de, operado por FOSSGIS en Alemania) para calcularlo, sin tu nombre
        ni tu cuenta.
      </p>

      <h2 className="mt-6 text-xl font-black">Tus derechos</h2>
      <p className="mt-2">
        Puedes conocer, actualizar, rectificar y pedir que borremos tus datos, y revocar esta autorización en cualquier
        momento, escribiéndonos al contacto de arriba. Si el navegador pide "No rastrear", no registramos tu uso.
      </p>
    </article>
  )
}
