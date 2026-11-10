import { describe, expect, it } from 'vitest'
import { filasDesdeCsv, leerCsv, PLANTILLA } from './csv'

describe('csv', () => {
  it('lee comillas, comas dentro de comillas y "" escapado', () => {
    expect(leerCsv('a,b\n"x, y","dijo ""hola"""\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'dijo "hola"'],
    ])
  })

  it('entiende el punto y coma de Excel en español, tildes en encabezados y BOM', () => {
    const { filas, ignoradas } = filasDesdeCsv('﻿Nombre;Categoría;Dirección;Ubicación;Notas\nPastel Pan;Panadería;Cra 27 # 71-08;4.79, -75.73;x\n;;;;\n')
    expect(filas).toEqual([{ nombre: 'Pastel Pan', categoria: 'Panadería', direccion: 'Cra 27 # 71-08', ubicacion: '4.79, -75.73' }])
    expect(ignoradas).toEqual(['Notas'])
  })

  it('la plantilla trae todas las columnas y una fila de ejemplo', () => {
    const { filas, ignoradas } = filasDesdeCsv(PLANTILLA)
    expect(ignoradas).toEqual([])
    expect(filas[0]).toMatchObject({ nombre: 'Panadería Ejemplo', horario: 'lun-sab 6:00-20:00; dom 7:00-13:00' })
  })
})
